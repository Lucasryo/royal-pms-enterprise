import { FormEvent, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Loader2, Send, Users } from 'lucide-react';
import { supabase } from '../supabase';
import { toast } from 'sonner';

const roomCategories = [
  { value: 'executivo', label: 'Executivo' },
  { value: 'master', label: 'Master' },
  { value: 'suite presidencial', label: 'Suite presidencial' },
];

export default function PublicBookingEngine() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  const [loading, setLoading] = useState(false);
  const [sentCode, setSentCode] = useState('');
  const [formData, setFormData] = useState({
    guest_name: '',
    contact_email: '',
    contact_phone: '',
    check_in: today,
    check_out: tomorrow,
    adults: 2,
    children: 0,
    category: 'executivo',
    notes: '',
  });

  const nights = useMemo(() => {
    const start = new Date(`${formData.check_in}T12:00:00`);
    const end = new Date(`${formData.check_out}T12:00:00`);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  }, [formData.check_in, formData.check_out]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSentCode('');

    if (formData.check_out <= formData.check_in) {
      toast.error('A data de saida precisa ser posterior a entrada.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-booking-request', {
        body: {
          ...formData,
          guests_per_uh: Number(formData.adults) + Number(formData.children),
          source: 'WEB-DIRETO',
        },
      });

      if (error) throw error;
      setSentCode(data?.reservation_code || '');
      toast.success('Solicitacao enviada para a central de reservas.');
      setFormData((current) => ({
        ...current,
        guest_name: '',
        contact_email: '',
        contact_phone: '',
        notes: '',
      }));
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel enviar a reserva agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-stone-200 bg-white/85 p-6 shadow-[0_28px_90px_rgba(68,37,15,0.12)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-700">Reservas diretas</p>
          <h2 className="mt-3 font-serif text-4xl leading-none tracking-[-0.04em] text-stone-950">
            Reserve direto com o hotel.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            Sem channel manager por enquanto: cada pedido entra na central de reservas para conferencia,
            disponibilidade e confirmacao manual pela equipe.
          </p>
        </div>
        <div className="rounded-3xl bg-stone-950 px-5 py-4 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Estimativa</p>
          <p className="mt-2 text-2xl font-black">{nights} noite{nights > 1 ? 's' : ''}</p>
        </div>
      </div>

      {sentCode && (
        <div className="mt-5 flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Solicitacao recebida: {sentCode}</p>
            <p className="mt-1 leading-6">Nossa central vai confirmar disponibilidade, tarifa final e garantia da reserva.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Nome completo</label>
          <input
            required
            value={formData.guest_name}
            onChange={(event) => setFormData({ ...formData, guest_name: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
            placeholder="Hospede principal"
          />
        </div>
        <div className="lg:col-span-4">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">E-mail</label>
          <input
            required
            type="email"
            value={formData.contact_email}
            onChange={(event) => setFormData({ ...formData, contact_email: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
            placeholder="voce@email.com"
          />
        </div>
        <div className="lg:col-span-4">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Telefone / WhatsApp</label>
          <input
            required
            value={formData.contact_phone}
            onChange={(event) => setFormData({ ...formData, contact_phone: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
            placeholder="(00) 00000-0000"
          />
        </div>
        <div className="lg:col-span-3">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Entrada</label>
          <input
            required
            type="date"
            min={today}
            value={formData.check_in}
            onChange={(event) => setFormData({ ...formData, check_in: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="lg:col-span-3">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Saida</label>
          <input
            required
            type="date"
            min={formData.check_in}
            value={formData.check_out}
            onChange={(event) => setFormData({ ...formData, check_out: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Adultos</label>
          <input
            required
            type="number"
            min={1}
            max={8}
            value={formData.adults}
            onChange={(event) => setFormData({ ...formData, adults: Number(event.target.value) })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Criancas</label>
          <input
            type="number"
            min={0}
            max={6}
            value={formData.children}
            onChange={(event) => setFormData({ ...formData, children: Number(event.target.value) })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Categoria</label>
          <select
            value={formData.category}
            onChange={(event) => setFormData({ ...formData, category: event.target.value })}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          >
            {roomCategories.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-9">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Observacoes</label>
          <textarea
            value={formData.notes}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
            placeholder="Pedidos especiais, horario previsto, acessibilidade, garagem..."
          />
        </div>
        <div className="flex flex-col justify-end gap-3 lg:col-span-3">
          <div className="rounded-3xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <CalendarRange className="h-4 w-4" />
              Confirmacao manual
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Users className="h-4 w-4" />
              {Number(formData.adults) + Number(formData.children)} hospede(s)
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 text-sm font-bold text-white shadow-lg shadow-stone-950/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar pedido
          </button>
        </div>
      </form>
    </div>
  );
}
