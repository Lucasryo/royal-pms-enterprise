import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Trash2, ImageOff } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCompanyScope } from '@/lib/useCompanyScope';
import { formatDate } from '@/lib/dates';
import type { Photo } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';

const RETENTION_DAYS = 30;
const BUCKET = 'photos';

interface PhotoWithUrl extends Photo {
  url: string | null;
}

function daysLeft(uploadedAt: string): number {
  const used = differenceInCalendarDays(new Date(), new Date(uploadedAt));
  return Math.max(0, RETENTION_DAYS - used);
}

export function PhotosPage() {
  const { profile } = useAuth();
  const { isMaster, companies, companyId, setCompanyId } = useCompanyScope();

  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<PhotoWithUrl | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('company_id', companyId)
      .order('uploaded_at', { ascending: false });
    if (error) {
      setLoading(false);
      toast.error('Erro ao carregar fotos: ' + error.message);
      return;
    }
    const rows = (data as Photo[] | null) ?? [];
    const urls: Record<string, string> = {};
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          rows.map((r) => r.storage_path),
          3600,
        );
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
      });
    }
    setPhotos(rows.map((r) => ({ ...r, url: urls[r.storage_path] ?? null })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!companyId) {
      toast.error('Selecione uma empresa.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('photos').insert({
        company_id: companyId,
        storage_path: path,
        original_name: file.name,
        uploaded_by: profile?.id ?? null,
      });
      if (insErr) throw insErr;
      toast.success('Foto enviada.');
      void load();
    } catch (e) {
      toast.error('Erro no upload: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    await supabase.storage.from(BUCKET).remove([deleting.storage_path]);
    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('id', deleting.id);
    setDeleteBusy(false);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
      return;
    }
    toast.success('Foto excluida.');
    setDeleting(null);
    void load();
  }

  const noCompany = isMaster && companies.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 sm:text-2xl">
            Fotos
          </h1>
          <p className="text-sm text-neutral-500">
            As fotos sao excluidas automaticamente apos {RETENTION_DAYS} dias.
          </p>
        </div>
        <label
          className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 ${
            uploading || !companyId ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Upload size={18} />
          )}
          Enviar foto
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading || !companyId}
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {isMaster && companies.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select
            label="Empresa"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {noCompany ? (
        <Card>
          <p className="text-sm text-neutral-600">
            Nenhuma empresa cadastrada. Crie uma empresa para comecar.
          </p>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">Nenhuma foto enviada ainda.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <Card key={p.id} className="!p-0">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100">
                {p.url ? (
                  <img
                    src={p.url}
                    alt={p.original_name ?? 'foto'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageOff className="text-neutral-300" size={32} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-700">
                    {p.original_name ?? 'foto'}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {formatDate(p.uploaded_at)} · expira em {daysLeft(p.uploaded_at)}d
                  </p>
                </div>
                <button
                  onClick={() => setDeleting(p)}
                  aria-label="Excluir foto"
                  className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Excluir foto"
        message="Tem certeza que deseja excluir esta foto?"
        confirmLabel="Excluir"
        loading={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
