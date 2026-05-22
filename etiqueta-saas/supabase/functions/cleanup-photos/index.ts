// cleanup-photos — remove fotos (Storage + tabela) com mais de 30 dias.
// Chamada diariamente pelo pg_cron. Protegida pelo header x-cleanup-secret.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RETENTION_DAYS = 30;
const BUCKET = 'photos';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Autorizacao por segredo compartilhado.
  const secret = Deno.env.get('CLEANUP_SECRET');
  if (!secret || req.headers.get('x-cleanup-secret') !== secret) {
    return json({ error: 'Nao autorizado' }, 401);
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: oldPhotos, error: selErr } = await admin
      .from('photos')
      .select('id, storage_path')
      .lt('uploaded_at', cutoff);
    if (selErr) {
      return json({ error: selErr.message }, 500);
    }

    const rows = oldPhotos ?? [];
    if (rows.length === 0) {
      return json({ deleted: 0 }, 200);
    }

    // Remove os arquivos do Storage.
    const paths = rows.map((r) => r.storage_path as string);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (rmErr) {
      return json({ error: 'Falha no Storage: ' + rmErr.message }, 500);
    }

    // Remove as linhas de metadados.
    const ids = rows.map((r) => r.id as string);
    const { error: delErr } = await admin
      .from('photos')
      .delete()
      .in('id', ids);
    if (delErr) {
      return json({ error: delErr.message }, 500);
    }

    return json({ deleted: rows.length }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
