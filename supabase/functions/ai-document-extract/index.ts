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

const FINANCE_ROLES = new Set(["admin", "finance", "faturamento", "reservations"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return json({ error: "AI extraction secrets are not configured." }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return json({ error: "Missing bearer token." }, 401);
    }

    const { data: userData, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !userData.user) {
      return json({ error: "Invalid session." }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, permissions")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) {
      return json({ error: profileError.message }, 500);
    }

    const canUseExtraction =
      FINANCE_ROLES.has(profile?.role ?? "") ||
      profile?.permissions?.canUploadFiles === true ||
      profile?.permissions?.canViewFinance === true;

    if (!canUseExtraction) {
      return json({ error: "You do not have permission to use AI extraction." }, 403);
    }

    const body = await req.json();
    const mode = String(body?.mode ?? "");
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    if (mode === "due-date") {
      const fileBase64 = String(body?.fileBase64 ?? "");
      const mimeType = String(body?.mimeType ?? "application/pdf");
      if (!fileBase64) {
        return json({ error: "fileBase64 is required." }, 400);
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        { inlineData: { data: fileBase64, mimeType } },
        "Extract the due date (Data de Vencimento) from this document. Return only the date in YYYY-MM-DD format. If not found, return NOT_FOUND.",
      ]);

      const text = (await result.response).text().trim();
      return json({ dueDate: /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null });
    }

    if (mode === "itau-statement") {
      const text = String(body?.text ?? "").trim();
      if (!text) {
        return json({ error: "text is required." }, 400);
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });

      const prompt = `Voce e um especialista financeiro. Extraia uma lista de transacoes bancarias do texto de extrato Itau abaixo.

FORMATO DE SAIDA: JSON, um array de objetos.
CAMPOS:
- date: string no formato ISO YYYY-MM-DD
- description: string
- amount: number, positivo para entradas e negativo para saidas
- doc_number: string, vazio quando nao existir

TEXTO:
${text}

Retorne apenas JSON valido. Se nao encontrar transacoes, retorne [].`;

      const result = await model.generateContent(prompt);
      const jsonText = (await result.response).text();
      const parsed = JSON.parse(jsonText || "[]");
      return json({ transactions: Array.isArray(parsed) ? parsed : [] });
    }

    return json({ error: "Invalid mode." }, 400);
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
