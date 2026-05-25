import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GATEWAY_MODE = Deno.env.get("VIRTUAL_CARD_GATEWAY_MODE") ?? "mock";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function luhnValid(value: string) {
  let sum = 0;
  let doubleDigit = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = Number(value[i]);
    if (!Number.isInteger(digit)) return false;
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum > 0 && sum % 10 === 0;
}

function hasPaymentCardData(value: string) {
  if (/(cvv|cvc|codigo de seguranca)/i.test(value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return true;
  const matches = value.match(/\b(?:\d[ -]?){13,19}\b/g) ?? [];
  return matches.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sessao obrigatoria." }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessao invalida." }, 401);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id,name,role,permissions,active")
    .eq("id", userData.user.id)
    .maybeSingle();

  const permissions = (profile?.permissions ?? {}) as Record<string, unknown>;
  const canCharge = profile?.role === "admin"
    || Boolean(permissions.canChargeVirtualCard)
    || ["manager", "reception", "finance", "faturamento"].includes(String(profile?.role ?? ""));

  if (!profile || profile.active === false || !canCharge) {
    return json({ error: "Seu perfil nao pode cobrar cartao virtual." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const reservationId = String(body?.reservation_id ?? "");
  const amount = Number(body?.amount ?? 0);
  const note = String(body?.note ?? "").slice(0, 300);

  if (!reservationId) return json({ error: "reservation_id obrigatorio." }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Valor de cobranca invalido." }, 400);
  if (hasPaymentCardData(JSON.stringify(body))) {
    return json({ error: "Dados de cartao nao podem ser enviados para esta funcao. Use apenas token/metadados." }, 400);
  }

  const { data: reservation, error: reservationError } = await adminClient
    .from("reservations")
    .select("id,reservation_code,guest_name,payment_method,payment_charge_status")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) return json({ error: reservationError.message }, 500);
  if (!reservation) return json({ error: "Reserva nao encontrada." }, 404);
  if (reservation.payment_method !== "VIRTUAL_CARD") {
    return json({ error: "Reserva nao esta configurada para cartao virtual." }, 400);
  }

  const { data: token, error: tokenError } = await adminClient
    .from("reservation_payment_tokens")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenError) return json({ error: tokenError.message }, 500);
  if (!token) return json({ error: "Nenhum token de cartao virtual vinculado a esta reserva." }, 400);
  if (!["tokenized", "charge_ready"].includes(token.status)) {
    return json({ error: `Cartao virtual nao esta pronto para cobranca. Status atual: ${token.status}.` }, 400);
  }
  if (!token.payment_token && GATEWAY_MODE !== "mock") {
    return json({ error: "Token do gateway ausente." }, 400);
  }

  // V1 segura: modo mock/manual registra a cobranca sem trafegar PAN/CVV.
  // Integracoes reais devem substituir este bloco por chamada server-side ao gateway.
  const transactionId = `${GATEWAY_MODE.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const { error: updateTokenError } = await adminClient
    .from("reservation_payment_tokens")
    .update({
      status: "charged",
      charged_amount: amount,
      charged_by: profile.id,
      charged_at: now,
      gateway_transaction_id: transactionId,
      failure_reason: null,
    })
    .eq("id", token.id);

  if (updateTokenError) return json({ error: updateTokenError.message }, 500);

  const { error: updateReservationError } = await adminClient
    .from("reservations")
    .update({
      payment_token_status: "charged",
      payment_charge_status: "charged",
      updated_at: now,
    })
    .eq("id", reservationId);

  if (updateReservationError) return json({ error: updateReservationError.message }, 500);

  await adminClient.from("audit_logs").insert({
    user_id: profile.id,
    user_name: profile.name,
    action: "Cobranca de cartao virtual",
    details: JSON.stringify({
      module: "recepcao",
      reservation_code: reservation.reservation_code,
      guest_name: reservation.guest_name,
      amount,
      provider: token.provider,
      brand: token.brand,
      last4: token.last4,
      transaction_id: transactionId,
      note,
      summary: `Cartao virtual cobrado para ${reservation.guest_name}`,
    }),
    type: "update",
    timestamp: now,
  });

  return json({
    ok: true,
    status: "charged",
    transaction_id: transactionId,
    charged_amount: amount,
  });
});
