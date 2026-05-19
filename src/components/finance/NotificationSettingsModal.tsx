import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Bell, Loader2, Plus, Trash2, X as CloseIcon } from 'lucide-react';
import { invalidateNotifyCache, RecipientChannel } from '../../lib/notify';

const CHANNELS: Array<{ id: RecipientChannel; label: string; sub: string }> = [
  { id: 'reception',            label: 'Recepção',                sub: 'Quando uma nota chega na etapa de recepção' },
  { id: 'reservations',         label: 'Reservas',                sub: 'Quando uma nota chega na etapa de reservas' },
  { id: 'finance',              label: 'Financeiro',              sub: 'Quando uma nota chega no financeiro' },
  { id: 'faturamento',          label: 'Faturamento (extra)',     sub: 'Canal extra de cópia para o faturamento' },
  { id: 'reservation_created',  label: 'Nova reserva criada',     sub: 'Aviso quando uma reserva entra no sistema' },
  { id: 'overdue_digest',       label: 'Digest de vencidos',      sub: 'Resumo diário de faturas vencidas' },
];

type Recipients = Partial<Record<RecipientChannel, string[]>>;

export default function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState('');
  const [recipients, setRecipients] = useState<Recipients>({});
  const [draft, setDraft] = useState<Record<RecipientChannel, string>>({} as any);

  useEffect(() => {
    (async () => {
      const [r, f] = await Promise.all([
        supabase.from('app_settings').select('value').eq('id', 'notification_recipients').maybeSingle(),
        supabase.from('app_settings').select('value').eq('id', 'notification_from').maybeSingle(),
      ]);
      const parsed = parseJson<Recipients>(r.data?.value) || {};
      setRecipients(parsed);
      setFrom((f.data?.value as string | undefined) || '');
      setLoading(false);
    })();
  }, []);

  function addEmail(ch: RecipientChannel) {
    const v = (draft[ch] || '').trim();
    if (!v) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast.error('Email inválido'); return; }
    setRecipients((p) => {
      const list = new Set(p[ch] || []);
      list.add(v);
      return { ...p, [ch]: Array.from(list) };
    });
    setDraft((d) => ({ ...d, [ch]: '' }));
  }
  function removeEmail(ch: RecipientChannel, email: string) {
    setRecipients((p) => ({ ...p, [ch]: (p[ch] || []).filter((e) => e !== email) }));
  }

  async function save() {
    setSaving(true);
    try {
      const [a, b] = await Promise.all([
        supabase.from('app_settings').upsert({ id: 'notification_recipients', value: JSON.stringify(recipients) }),
        supabase.from('app_settings').upsert({ id: 'notification_from', value: from.trim() }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      invalidateNotifyCache();
      toast.success('Notificações salvas');
      onClose();
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(ch: RecipientChannel) {
    const list = (recipients[ch] || []).filter(Boolean);
    if (list.length === 0) { toast.error('Adicione pelo menos um email primeiro'); return; }
    const tid = toast.loading('Enviando teste…');
    const { data, error } = await supabase.functions.invoke('send-resend-email', {
      body: {
        to: list,
        subject: '[Teste] Notificação Royal PMS',
        html: `<p>Este é um envio de teste do canal <b>${ch}</b>.</p><p>Se você está vendo isto, o Resend está configurado corretamente.</p>`,
        from: from.trim() || undefined,
      },
    });
    if (error || (data as any)?.error) {
      toast.error('Falha: ' + (error?.message || (data as any)?.error), { id: tid });
    } else {
      toast.success('Teste enviado', { id: tid });
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-neutral-700" />
            <div>
              <div className="text-sm font-black text-neutral-900">Notificações por email (Resend)</div>
              <div className="text-[11px] text-neutral-500">Defina quem recebe email em cada evento</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100"><CloseIcon className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-neutral-300" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Endereço remetente (From)</label>
              <input value={from} onChange={(e) => setFrom(e.target.value)}
                placeholder='Ex: "Royal PMS &lt;notifications@royal.app.br&gt;"'
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm" />
              <p className="mt-1 text-[11px] text-neutral-400">Use um domínio verificado no Resend. Se vazio, usa o default da edge function.</p>
            </div>

            <div className="space-y-3">
              {CHANNELS.map((ch) => {
                const list = recipients[ch.id] || [];
                return (
                  <div key={ch.id} className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-neutral-900">{ch.label}</div>
                        <div className="text-[11px] text-neutral-500">{ch.sub}</div>
                      </div>
                      <button onClick={() => sendTest(ch.id)}
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-neutral-100">
                        Enviar teste
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {list.length === 0 && <span className="text-[11px] italic text-neutral-400">Ninguém configurado</span>}
                      {list.map((email) => (
                        <span key={email} className="inline-flex items-center gap-1 rounded-full bg-white border border-neutral-200 px-2.5 py-1 text-[11px] font-bold text-neutral-700">
                          {email}
                          <button onClick={() => removeEmail(ch.id, email)} className="text-neutral-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <input value={draft[ch.id] || ''} onChange={(e) => setDraft((d) => ({ ...d, [ch.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(ch.id); } }}
                        placeholder="email@empresa.com" type="email"
                        className="flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs" />
                      <button onClick={() => addEmail(ch.id)} className="flex items-center gap-1 rounded-lg bg-neutral-950 px-2.5 py-1.5 text-xs font-bold text-white">
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button onClick={onClose} className="rounded-2xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-500">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function parseJson<T>(v: unknown): T | null {
  if (!v) return null;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return null; }
}
