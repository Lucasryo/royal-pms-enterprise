// admin-create-user — cria um usuario (auth + profile) com company_id e role.
// Apenas o usuario master pode invocar. Usa a service role key.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Metodo nao permitido' }, 405);
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Identifica o chamador a partir do JWT enviado.
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Nao autenticado' }, 401);
    }

    // 2. Confirma que o chamador e o usuario master.
    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (callerProfile?.role !== 'master') {
      return json(
        { error: 'Apenas o usuario master pode criar usuarios' },
        403,
      );
    }

    // 3. Valida o corpo.
    const body = await req.json().catch(() => null);
    const email: string | undefined = body?.email;
    const password: string | undefined = body?.password;
    const fullName: string | null = body?.full_name ?? null;
    const role: string | undefined = body?.role;
    const companyId: string | null = body?.company_id ?? null;

    if (!email || !password || !role) {
      return json({ error: 'Dados incompletos (email, senha, role)' }, 400);
    }
    if (role !== 'master' && role !== 'property') {
      return json({ error: 'Role invalido' }, 400);
    }
    if (role === 'property' && !companyId) {
      return json(
        { error: 'company_id e obrigatorio para usuario da empresa' },
        400,
      );
    }

    // 4. Cria o usuario no Auth.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
    if (createErr || !created.user) {
      return json(
        { error: createErr?.message ?? 'Falha ao criar usuario' },
        400,
      );
    }

    // 5. Define role e empresa no profile (o trigger ja criou a linha base).
    const { error: upsertErr } = await admin.from('profiles').upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      company_id: role === 'master' ? null : companyId,
      active: true,
    });
    if (upsertErr) {
      // Desfaz a criacao do usuario para nao deixar conta orfa.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: upsertErr.message }, 400);
    }

    return json({ ok: true, user_id: created.user.id }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
