import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function buildSystemPrompt(config: Record<string, unknown> | null): string {
  if (!config) {
    return "Você é um assistente virtual de hotel. Responda de forma amigável e profissional às perguntas dos hóspedes sobre reservas, acomodações e serviços do hotel. Mantenha respostas curtas e diretas, como num chat de WhatsApp.";
  }

  const lines: string[] = [];
  lines.push(`Você é o assistente virtual do hotel "${config.name ?? "Hotel"}".`);

  if (config.description) {
    lines.push(`\nSobre o hotel:\n${config.description}`);
  }

  if (config.address) {
    lines.push(`\nEndereço: ${config.address}`);
  }

  if (config.phone) {
    lines.push(`Telefone: ${config.phone}`);
  }

  if (config.email) {
    lines.push(`E-mail: ${config.email}`);
  }

  if (config.policies) {
    lines.push(`\nPolíticas do hotel:\n${config.policies}`);
  }

  if (config.rooms) {
    lines.push(`\nTipos de acomodação:\n${config.rooms}`);
  }

  if (config.pricingTable) {
    lines.push(`\nTabela de preços:\n${config.pricingTable}`);
  }

  if (config.faq) {
    lines.push(`\nPerguntas frequentes:\n${config.faq}`);
  }

  const mood = String(config.botMood ?? "friendly");
  const moodInstructions: Record<string, string> = {
    friendly: "Seja amigável, caloroso e acolhedor.",
    formal: "Seja formal e profissional.",
    casual: "Seja descontraído e próximo.",
  };
  lines.push(`\nPersonalidade: ${moodInstructions[mood] ?? moodInstructions.friendly}`);

  if (config.upsellActive) {
    lines.push("Quando apropriado, sugira upgrades ou serviços adicionais do hotel.");
  }

  lines.push("\nResponda sempre de forma concisa, como se fosse uma conversa de WhatsApp. Nunca escreva blocos longos de texto sem necessidade.");

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY is not configured." }, 500);
  }

  try {
    const body = await req.json();
    const message = String(body?.message ?? "").trim();

    if (!message) {
      return json({ error: "message is required." }, 400);
    }

    // Load bot config from app_settings
    let botConfig: Record<string, unknown> | null = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const { data } = await adminClient
        .from("app_settings")
        .select("value")
        .eq("id", "bot_config")
        .maybeSingle();

      if (data?.value && typeof data.value === "object") {
        botConfig = data.value as Record<string, unknown>;
      }
    }

    const systemPrompt = buildSystemPrompt(botConfig);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(message);
    const reply = (await result.response).text().trim();

    return json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
