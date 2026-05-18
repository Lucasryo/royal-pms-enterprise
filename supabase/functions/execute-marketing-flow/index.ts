import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type FlowNode = {
  id: string;
  data?: {
    variant?: "trigger" | "message" | "action";
    subtitle?: string;
    label?: string;
  };
};
type FlowEdge = { source?: string; target?: string };
type FlowRow = {
  id: string;
  name: string;
  trigger_type: "keyword" | "event" | "schedule" | "manual";
  trigger_config: { keyword?: string } | null;
  nodes: FlowNode[] | null;
  edges: FlowEdge[] | null;
};
type InboxMessage = {
  id: string;
  contact_id: string;
  contact_identifier: string;
  channel: string;
  subject: string | null;
  body: string;
};
type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  tags: string[] | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) return json({ error: "Forbidden" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.messageId ?? "").trim();
    if (!messageId) return json({ error: "messageId required" }, 400);

    const { data: msg, error: msgError } = await admin
      .from("inbox_messages")
      .select("id, contact_id, contact_identifier, channel, subject, body")
      .eq("id", messageId)
      .eq("direction", "in")
      .maybeSingle();
    if (msgError) throw msgError;
    if (!msg) return json({ skipped: "message_not_found" });

    const message = msg as InboxMessage;
    const { data: contactData, error: contactError } = await admin
      .from("marketing_contacts")
      .select("id, name, email, phone, channel, tags")
      .eq("id", message.contact_id)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contactData) return json({ skipped: "contact_not_found" });
    const contact = contactData as Contact;

    const { data: flowData, error: flowError } = await admin
      .from("marketing_flows")
      .select("id, name, trigger_type, trigger_config, nodes, edges")
      .eq("status", "active")
      .eq("trigger_type", "keyword");
    if (flowError) throw flowError;

    const flows = ((flowData ?? []) as FlowRow[]).filter((flow) => flowMatches(flow, message.body));
    const results = [];
    for (const flow of flows) {
      results.push(await executeFlow(flow, message, contact));
    }

    return json({ ok: true, matched: flows.length, results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected" }, 500);
  }
});

function flowMatches(flow: FlowRow, text: string) {
  const keyword = (flow.trigger_config?.keyword || getTriggerNode(flow)?.data?.subtitle || "").trim().toLowerCase();
  if (!keyword) return false;
  return text.toLowerCase().includes(keyword);
}

async function executeFlow(flow: FlowRow, message: InboxMessage, contact: Contact) {
  const execution = await admin.from("marketing_flow_executions").insert([{
    flow_id: flow.id,
    contact_id: contact.id,
    message_id: message.id,
    status: "started",
    details: { flow_name: flow.name },
  }]).select("id").single();
  const executionId = (execution.data as { id: string } | null)?.id;

  try {
    const nodes = orderedExecutableNodes(flow);
    const details: Array<Record<string, unknown>> = [];
    for (const node of nodes) {
      const variant = node.data?.variant;
      const content = String(node.data?.subtitle ?? "").trim();
      if (!content) continue;

      if (variant === "message") {
        details.push(await sendAutomationMessage(flow, message, contact, content));
      }
      if (variant === "action") {
        details.push(await applyAction(contact, content));
      }
    }

    await markExecution(executionId, "completed", { nodes: details });
    return { flow_id: flow.id, status: "completed", details };
  } catch (error) {
    await markExecution(executionId, "failed", {}, error instanceof Error ? error.message : "Unexpected");
    return { flow_id: flow.id, status: "failed", error: error instanceof Error ? error.message : "Unexpected" };
  }
}

function orderedExecutableNodes(flow: FlowRow) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  const trigger = getTriggerNode(flow);
  if (!trigger) return nodes.filter((n) => n.data?.variant !== "trigger");

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: FlowNode[] = [];
  const seen = new Set<string>([trigger.id]);
  let frontier = edges.filter((edge) => edge.source === trigger.id).map((edge) => edge.target).filter(Boolean) as string[];
  while (frontier.length > 0) {
    const currentId = frontier.shift()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    const node = byId.get(currentId);
    if (node) ordered.push(node);
    frontier = frontier.concat(edges.filter((edge) => edge.source === currentId).map((edge) => edge.target).filter(Boolean) as string[]);
  }
  return ordered.length > 0 ? ordered : nodes.filter((n) => n.data?.variant !== "trigger");
}

function getTriggerNode(flow: FlowRow) {
  return (Array.isArray(flow.nodes) ? flow.nodes : []).find((node) => node.data?.variant === "trigger");
}

async function sendAutomationMessage(flow: FlowRow, message: InboxMessage, contact: Contact, text: string) {
  const personalized = personalize(text, contact);
  const now = new Date().toISOString();
  const subject = message.channel === "email"
    ? (message.subject?.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject || flow.name}`)
    : null;
  let sentExternally = false;
  let externalError: string | null = null;

  if (message.channel === "email" && contact.email) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact.email, subject, body: personalized }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.sent) throw new Error(result.error || "send-email failed");
      sentExternally = true;
    } catch (error) {
      externalError = error instanceof Error ? error.message : "send-email failed";
    }
  }

  await admin.from("inbox_messages").insert([{
    contact_id: contact.id,
    contact_identifier: contact.email || contact.phone || contact.name || contact.id,
    channel: message.channel,
    direction: "out",
    subject,
    body: personalized,
    read: true,
  }]);
  await admin.from("marketing_contacts").update({
    last_message: personalized,
    last_message_at: now,
    status: externalError ? "needs_human" : "ai_responded",
    unread_count: 0,
    updated_at: now,
  }).eq("id", contact.id);

  return { node: "message", sent_externally: sentExternally, external_error: externalError };
}

async function applyAction(contact: Contact, raw: string) {
  const now = new Date().toISOString();
  const [kindRaw, ...valueParts] = raw.split(":");
  const kind = kindRaw.trim().toLowerCase();
  const value = valueParts.join(":").trim();
  if (!kind || !value) return { node: "action", skipped: "invalid_action" };

  if (kind === "status") {
    const allowed = new Set(["new", "ai_responded", "needs_human", "resolved"]);
    if (!allowed.has(value)) return { node: "action", skipped: "invalid_status", value };
    await admin.from("marketing_contacts").update({ status: value, updated_at: now }).eq("id", contact.id);
    return { node: "action", status: value };
  }

  if (kind === "tag") {
    const tags = Array.from(new Set([...(contact.tags ?? []), value]));
    await admin.from("marketing_contacts").update({ tags, updated_at: now }).eq("id", contact.id);
    contact.tags = tags;
    return { node: "action", tag: value };
  }

  return { node: "action", skipped: "unsupported_action", kind };
}

async function markExecution(id: string | undefined, status: string, details: unknown, error?: string) {
  if (!id) return;
  await admin.from("marketing_flow_executions").update({ status, details, error: error ?? null }).eq("id", id);
}

function personalize(text: string, contact: Contact) {
  const firstName = (contact.name ?? "").split(" ")[0] || "tudo bem";
  return text.replace(/\[NOME\]/gi, firstName).replace(/\{\{name\}\}/gi, firstName);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
