import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, getAdminClient, json, triggerAutoRespond, upsertContactAndMessage, type MediaItem, type ParsedMessage } from "./shared.ts";

type InboundMapping = {
  sender_id_path?: string;
  name_path?: string;
  text_path?: string;
  message_id_path?: string;
  timestamp_path?: string;
  media_url_path?: string;
  media_mime_path?: string;
};

type GenericProvider = {
  id: string;
  name: string;
  channel: "whatsapp" | "instagram" | "facebook";
  enabled: boolean;
  secret_token?: string;
  inbound: InboundMapping;
  outbound: { url: string; method?: string; headers?: Record<string, string>; body_template: string };
};

function getPath(obj: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split(/\.|\[|\]/).filter(Boolean).reduce((o: any, k: string) => (o == null ? undefined : o[k]), obj as any);
}

function applyInboundMapping(payload: unknown, mapping: InboundMapping, providerId: string): ParsedMessage | null {
  const senderId = getPath(payload, mapping.sender_id_path);
  if (senderId == null || senderId === "") return null;
  const text = String(getPath(payload, mapping.text_path) ?? "");
  const externalId = String(getPath(payload, mapping.message_id_path) ?? `${providerId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
  const tsRaw = Number(getPath(payload, mapping.timestamp_path));
  const tsMs = Number.isFinite(tsRaw) && tsRaw > 0 ? (tsRaw > 1e12 ? tsRaw : tsRaw * 1000) : Date.now();
  const mediaUrl = mapping.media_url_path ? getPath(payload, mapping.media_url_path) : null;
  let mediaItems: MediaItem[] | undefined;
  if (mediaUrl && typeof mediaUrl === "string") {
    const mime = String(getPath(payload, mapping.media_mime_path) ?? "application/octet-stream");
    mediaItems = [{ source: "meta-direct", mediaIdOrUrl: mediaUrl, mime, filename: `media.${mime.split("/")[1] ?? "bin"}` }];
  }
  return {
    identifier: String(senderId),
    name: String(getPath(payload, mapping.name_path) ?? senderId),
    text: text || (mediaItems ? "[ANEXO]" : ""),
    externalId,
    timestamp: Math.floor(tsMs / 1000),
    mediaItems,
  };
}

async function loadProvider(providerId: string): Promise<GenericProvider | null> {
  const admin = getAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("id", "generic_providers").maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    const list: GenericProvider[] = parsed.providers ?? [];
    return list.find(p => p.id === providerId) ?? null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  if (!providerId) return json({ error: "missing ?provider" }, 400);

  const provider = await loadProvider(providerId);
  if (!provider) return json({ error: "provider not found" }, 404);
  if (!provider.enabled) return json({ skipped: "provider disabled" });

  if (provider.secret_token) {
    const got = req.headers.get("x-provider-secret") ?? url.searchParams.get("secret");
    if (got !== provider.secret_token) return json({ error: "Forbidden" }, 403);
  }

  let payload: unknown = {};
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    const parsed = applyInboundMapping(payload, provider.inbound, providerId);
    if (!parsed) return json({ ignored: "could not extract sender/message" });
    const contactId = await upsertContactAndMessage(provider.channel, parsed, undefined, providerId);
    if (contactId) triggerAutoRespond(contactId, provider.channel, parsed.text);
    return json({ processed: 1, contact_id: contactId });
  } catch (err) {
    console.warn("[webhook-generic] error:", err);
    return json({ error: err instanceof Error ? err.message : "error" });
  }
});
