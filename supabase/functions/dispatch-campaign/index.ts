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

type AudienceFilter = { channel?: string; status?: string };
type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  subject: string | null;
  body: string | null;
  audience_filter: AudienceFilter;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json();
    const campaignId = String(body?.campaignId ?? "").trim();
    if (!campaignId) return json({ error: "campaignId required" }, 400);

    const { data: campaign, error: campaignError } = await admin
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return json({ error: "Campaign not found" }, 404);
    if (campaign.channel !== "email") return json({ error: "Only email channel is supported in MVP" }, 400);
    if (!campaign.subject || !campaign.body) return json({ error: "Subject and body required" }, 400);

    // Mark running
    await admin.from("marketing_campaigns").update({
      status: "running",
      started_at: new Date().toISOString(),
    }).eq("id", campaignId);

    // Resolve audience
    let query = admin.from("marketing_contacts").select("id, name, email").not("email", "is", null);
    const filter = (campaign.audience_filter ?? {}) as AudienceFilter;
    if (filter.channel) query = query.eq("channel", filter.channel);
    if (filter.status) query = query.eq("status", filter.status);
    const { data: contacts, error: contactsError } = await query;
    if (contactsError) throw contactsError;

    const recipients = (contacts ?? []).filter(c => c.email);
    await admin.from("marketing_campaigns").update({ total_recipients: recipients.length }).eq("id", campaignId);

    // Auth header for nested send-email invocation
    const authHeader = req.headers.get("authorization") ?? "";

    let delivered = 0;
    let failed = 0;
    for (const contact of recipients) {
      // Insert pending row (idempotent via unique)
      const { error: insertErr } = await admin.from("marketing_campaign_sends").insert([{
        campaign_id: campaignId,
        contact_id: contact.id,
        status: "pending",
      }]);
      if (insertErr && insertErr.code !== "23505") {
        console.warn("[dispatch] insert error:", insertErr.message);
        continue;
      }

      const personalizedSubject = personalize(campaign.subject!, contact.name);
      const personalizedBody = personalize(campaign.body!, contact.name);

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: contact.email,
            subject: personalizedSubject,
            body: personalizedBody,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.sent) throw new Error(result.error || "send failed");

        await admin.from("marketing_campaign_sends")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("campaign_id", campaignId).eq("contact_id", contact.id);
        delivered += 1;
      } catch (error) {
        await admin.from("marketing_campaign_sends")
          .update({ status: "failed", error: error instanceof Error ? error.message : "unknown" })
          .eq("campaign_id", campaignId).eq("contact_id", contact.id);
        failed += 1;
      }
    }

    await admin.from("marketing_campaigns").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      delivered_count: delivered,
      failed_count: failed,
    }).eq("id", campaignId);

    return json({ ok: true, dispatched: delivered, failed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected" }, 500);
  }
});

function personalize(text: string, name: string | null) {
  const firstName = (name ?? "").split(" ")[0] || "";
  return text.replace(/\[NOME\]/gi, firstName);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
