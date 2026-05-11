import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAINTENANCE_NOTIFY_WEBHOOK_URL = Deno.env.get("MAINTENANCE_NOTIFY_WEBHOOK_URL") ?? "";
const MAINTENANCE_NOTIFY_WEBHOOK_TOKEN = Deno.env.get("MAINTENANCE_NOTIFY_WEBHOOK_TOKEN") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ROLES = new Set(["admin", "manager", "reception", "eventos", "restaurant", "housekeeping", "maintenance"]);
const RECIPIENT_ROLES = ["maintenance", "manager", "admin"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase secrets are not configured." }, 500);

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing bearer token." }, 401);

    const { data: userData, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !userData.user) return json({ error: "Invalid session." }, 401);

    const { data: caller } = await adminClient
      .from("profiles")
      .select("id, role, name")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!ALLOWED_ROLES.has(caller?.role ?? "")) {
      return json({ error: "You do not have permission to notify maintenance." }, 403);
    }

    const body = await req.json();
    const event = String(body?.event ?? "status_changed");
    const ticketId = String(body?.ticket_id ?? "");
    const title = cleanText(body?.title, 160);
    const roomNumber = cleanText(body?.room_number, 40);
    const priority = cleanText(body?.priority, 30);
    const status = cleanText(body?.status, 40);
    const actorName = cleanText(body?.actor_name || caller?.name || "Sistema", 120);
    const reason = cleanText(body?.reason, 600);

    if (!ticketId || !title) return json({ error: "ticket_id and title are required." }, 400);

    const { data: recipients, error: recipientsError } = await adminClient
      .from("profiles")
      .select("id, name, role, phone")
      .in("role", RECIPIENT_ROLES)
      .not("phone", "is", null);

    if (recipientsError) return json({ error: recipientsError.message }, 500);

    const validRecipients = (recipients || [])
      .map((recipient) => ({
        ...recipient,
        phone: normalizePhone(recipient.phone),
      }))
      .filter((recipient) => recipient.phone);

    const message = buildMessage({
      event,
      title,
      roomNumber,
      priority,
      status,
      actorName,
      reason,
    });

    // 1F: não salvar telefone em plaintext — apenas mascarado para auditoria
    const logRows = validRecipients.map((recipient) => ({
      ticket_id: ticketId,
      recipient_user_id: recipient.id,
      recipient_name: recipient.name,
      channel: "phone_webhook",
      event_type: event,
      status: MAINTENANCE_NOTIFY_WEBHOOK_URL ? "queued" : "not_configured",
      payload: { title, roomNumber, priority, status, actorName },
    }));

    if (logRows.length) {
      await adminClient.from("maintenance_notification_logs").insert(logRows);
    }

    if (!MAINTENANCE_NOTIFY_WEBHOOK_URL) {
      return json({ delivered: false, configured: false, recipients: validRecipients.length });
    }

    // 4B: validar HTTPS e aplicar timeout de 5s no webhook externo
    if (!MAINTENANCE_NOTIFY_WEBHOOK_URL.startsWith("https://")) {
      return json({ error: "Webhook URL must use HTTPS." }, 400);
    }

    const responses = await Promise.allSettled(
      validRecipients.map((recipient) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        return fetch(MAINTENANCE_NOTIFY_WEBHOOK_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(MAINTENANCE_NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${MAINTENANCE_NOTIFY_WEBHOOK_TOKEN}` } : {}),
          },
          body: JSON.stringify({
            to: recipient.phone,
            name: recipient.name,
            role: recipient.role,
            message,
            event,
            ticket_id: ticketId,
            ticket: { title, room_number: roomNumber, priority, status, actor_name: actorName, reason },
          }),
        }).finally(() => clearTimeout(timeoutId));
      })
    );

    return json({
      delivered: true,
      configured: true,
      recipients: validRecipients.length,
      failed: responses.filter((response) => response.status === "rejected").length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return "";
}

function buildMessage({
  event,
  title,
  roomNumber,
  priority,
  status,
  actorName,
  reason,
}: {
  event: string;
  title: string;
  roomNumber: string;
  priority: string;
  status: string;
  actorName: string;
  reason: string;
}) {
  const headline = event === "opened" ? "Novo chamado de manutencao" : "Atualizacao de chamado";
  return [
    `Royal PMS - ${headline}`,
    `Chamado: ${title}`,
    roomNumber ? `UH: ${roomNumber}` : "UH: nao vinculada",
    priority ? `Prioridade: ${priority}` : "",
    status ? `Status: ${status}` : "",
    `Responsavel pela acao: ${actorName}`,
    reason ? `Justificativa: ${reason}` : "",
  ].filter(Boolean).join("\n");
}
