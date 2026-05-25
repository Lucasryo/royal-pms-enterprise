import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GATEWAY_MODE = normalizeGatewayMode(Deno.env.get("VIRTUAL_CARD_GATEWAY_MODE") ?? "mock");

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeGatewayMode(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["prod", "production"].includes(normalized)) return "production";
  if (["test", "sandbox"].includes(normalized)) return "sandbox";
  if (normalized === "manual") return "manual";
  return "mock";
}

function looksLikeUuid(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  const requestedPropertyId = looksLikeUuid(body?.property_id) ? String(body.property_id) : null;

  if (!reservationId) return json({ error: "reservation_id obrigatorio." }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Valor de cobranca invalido." }, 400);
  if (hasPaymentCardData(JSON.stringify(body))) {
    return json({ error: "Dados de cartao nao podem ser enviados para esta funcao. Use apenas token/metadados." }, 400);
  }

  const { data: reservation, error: reservationError } = await adminClient
    .from("reservations")
    .select("id,reservation_code,guest_name,payment_method,payment_charge_status,property_id,property_scope")
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

  let propertyId = requestedPropertyId
    || (looksLikeUuid(reservation.property_id) ? reservation.property_id : null)
    || (looksLikeUuid(token.property_id) ? token.property_id : null);

  const propertyScope = String(token.property_scope || reservation.property_scope || "").trim();
  if (!propertyId && propertyScope && propertyScope !== "default") {
    const { data: property, error: propertyError } = await adminClient
      .from("hotel_properties")
      .select("id")
      .eq("code", propertyScope)
      .maybeSingle();

    if (propertyError) return json({ error: propertyError.message }, 500);
    propertyId = property?.id ?? null;
  }

  let credentialId: string | null = null;
  if (GATEWAY_MODE === "sandbox" || GATEWAY_MODE === "production") {
    if (!propertyId) {
      return json({ error: "property_id obrigatorio para cobranca Cielo em sandbox/producao." }, 400);
    }

    const { data: credential, error: credentialError } = await adminClient
      .from("property_payment_gateway_credentials")
      .select("id,merchant_id,merchant_key_secret_ref,status")
      .eq("property_id", propertyId)
      .eq("provider", "cielo")
      .eq("mode", GATEWAY_MODE)
      .eq("status", "active")
      .maybeSingle();

    if (credentialError) return json({ error: credentialError.message }, 500);
    if (!credential?.merchant_id || !credential?.merchant_key_secret_ref) {
      return json({ error: "Credenciais Cielo ativas nao configuradas para esta propriedade." }, 400);
    }
    credentialId = credential.id;
  }

  // V1 segura: modo mock/manual registra a cobranca sem trafegar PAN/CVV.
  // Integracoes reais devem substituir este bloco por chamada server-side ao gateway.
  const transactionId = `${GATEWAY_MODE.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const provider = GATEWAY_MODE === "mock" || GATEWAY_MODE === "manual" ? GATEWAY_MODE : "cielo";
  const shouldUseCieloAdapter = GATEWAY_MODE === "sandbox" || GATEWAY_MODE === "production";

  const { data: transaction, error: transactionError } = await adminClient
    .from("virtual_card_transactions")
    .insert({
      property_id: propertyId,
      reservation_id: reservationId,
      reservation_payment_token_id: token.id,
      credential_id: credentialId,
      provider,
      gateway_mode: GATEWAY_MODE,
      status: shouldUseCieloAdapter ? "pending" : "charged",
      amount,
      currency: "BRL",
      gateway_transaction_id: transactionId,
      brand: token.brand,
      last4: token.last4,
      requested_by: profile.id,
      requested_at: now,
      processed_at: shouldUseCieloAdapter ? null : now,
      gateway_response_code: GATEWAY_MODE === "mock" ? "MOCK_APPROVED" : null,
      gateway_response_message: GATEWAY_MODE === "mock"
        ? "Cobranca mock aprovada pelo Royal PMS"
        : shouldUseCieloAdapter
          ? "Adaptador Cielo server-side ainda nao implementado."
          : null,
      metadata: {
        reservation_code: reservation.reservation_code,
        property_scope: propertyScope || null,
        note,
      },
    })
    .select("id")
    .single();

  if (transactionError) return json({ error: transactionError.message }, 500);

  if (shouldUseCieloAdapter) {
    return json({
      error: "Adaptador Cielo ainda nao implementado. Transacao registrada como pendente, sem capturar cobranca.",
      status: "pending",
      virtual_card_transaction_id: transaction.id,
    }, 501);
  }

  const { error: updateTokenError } = await adminClient
    .from("reservation_payment_tokens")
    .update({
      status: "charged",
      charged_amount: amount,
      charged_by: profile.id,
      charged_at: now,
      gateway_transaction_id: transactionId,
      failure_reason: null,
      property_id: propertyId,
    })
    .eq("id", token.id);

  if (updateTokenError) return json({ error: updateTokenError.message }, 500);

  const { error: updateReservationError } = await adminClient
    .from("reservations")
    .update({
      payment_token_status: "charged",
      payment_charge_status: "charged",
      property_id: propertyId,
      updated_at: now,
    })
    .eq("id", reservationId);

  if (updateReservationError) return json({ error: updateReservationError.message }, 500);

  const { error: receiptError } = await adminClient
    .from("virtual_card_receipts")
    .insert({
      transaction_id: transaction.id,
      property_id: propertyId,
      reservation_id: reservationId,
      receipt_type: "charge",
      status: "issued",
      amount,
      currency: "BRL",
      provider_reference: transactionId,
      issued_by: profile.id,
      issued_at: now,
      payload_sanitized: {
        provider,
        gateway_mode: GATEWAY_MODE,
        reservation_code: reservation.reservation_code,
        brand: token.brand,
        last4: token.last4,
      },
    });

  if (receiptError) return json({ error: receiptError.message }, 500);

  if (credentialId) {
    await adminClient
      .from("property_payment_gateway_credentials")
      .update({ last_used_at: now })
      .eq("id", credentialId);
  }

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
      virtual_card_transaction_id: transaction.id,
      property_id: propertyId,
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
    virtual_card_transaction_id: transaction.id,
    charged_amount: amount,
  });
});
