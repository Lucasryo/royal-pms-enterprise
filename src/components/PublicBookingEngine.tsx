import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Loader2, Send, Users, Info } from 'lucide-react';
import { supabase } from '../supabase';
import { toast } from 'sonner';
import RatesCalendar from './RatesCalendar';

const roomCategories = [
  { value: 'executivo', label: 'Executivo' },
  { value: 'master', label: 'Master' },
  { value: 'suite presidencial', label: 'Suite presidencial' },
];

type QuoteBreakdown = { date: string; rate: number; label: string; weekend: boolean };

type Quote =
  | { ok: true; available: true; nights: number; total: number; nightly_total: number; extra_guest_total: number; extra_guests: number; breakdown: QuoteBreakdown[]; currency: string }
  | { ok: true; available: false; nights: number; reason: string }
  | { ok: false; error: string };

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PublicBookingEngine() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  const [loading, setLoading] = useState(false);
  const [sentCode, setSentCode] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
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

  // Fetch quote when relevant inputs change (debounced)
  useEffect(() => {
    if (formData.check_out <= formData.check_in) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('public-rates-quote', {
          body: {
            check_in: formData.check_in,
            check_out: formData.check_out,
            category: formData.category,
            adults: formData.adults,
            children: formData.children,
          },
        });
        if (cancelled) return;
        if (error) {
          setQuote({ ok: false, error: error.message });
          return;
        }
        setQuote(data as Quote);
      } catch (err) {
        if (!cancelled) {
          setQuote({ ok: false, error: err instanceof Error ? err.message : 'Erro inesperado.' });
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [formData.check_in, formData.check_out, formData.category, formData.adults, formData.children]);

  const isPriceAvailable = quote && quote.ok && 'available' in quote && quote.available === true;
  const totalLabel = isPriceAvailable ? formatBRL(quote.total) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSentCode('');

    if (!formData.check_in || !formData.check_out) {
      toast.error('Selecione a entrada e a saida no calendario.');
      return;
    }
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
      toast.success(
        isPriceAvailable
          ? `Reserva enviada! Total estimado ${totalLabel}.`
          : 'Solicitacao enviada — central confirma a tarifa.',
      );
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
          <h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.04em] text-stone-950">
            Reserve direto com o hotel.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            Tarifa publica calculada na hora. A central de reservas confirma disponibilidade e garantia da reserva.
          </p>
        </div>

        {/* Price box */}
        <div className={`min-w-[230px] rounded-3xl px-5 py-4 text-white ${isPriceAvailable ? 'bg-stone-950' : 'bg-stone-700'}`}>
          {quoteLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Calculando...</p>
            </div>
          ) : isPriceAvailable ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Estimativa total</p>
              <p className="mt-1 text-3xl font-black">{totalLabel}</p>
              <p className="mt-1 text-xs text-white/65">
                {quote.nights} noite{quote.nights > 1 ? 's' : ''} · diaria media {formatBRL(quote.nightly_total / quote.nights)}
              </p>
            </>
          ) : quote && quote.ok && !quote.available ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Cotacao manual</p>
              <p className="mt-1 text-sm leading-5 text-white/85">{quote.reason}</p>
            </>
          ) : quote && !quote.ok ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">Erro</p>
              <p className="mt-1 text-sm leading-5 text-white/85">{quote.error}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Periodo</p>
              <p className="mt-2 text-2xl font-black">
                {nights} noite{nights > 1 ? 's' : ''}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Breakdown by night (when price available and >1 night) */}
      {isPriceAvailable && quote.breakdown.length > 0 && (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stone-700">
            <Info className="h-4 w-4 text-amber-700" />
            Desdobramento por noite
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {quote.breakdown.map((b) => (
              <div key={b.date} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">{new Date(`${b.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                  <p className="text-[10px] uppercase tracking-widest text-stone-500">
                    {b.label}{b.weekend ? ' · fim de semana' : ''}
                  </p>
                </div>
                <p className="font-black text-stone-900">{formatBRL(b.rate)}</p>
              </div>
            ))}
          </div>
          {quote.extra_guest_total > 0 && (
            <p className="mt-3 text-xs text-amber-800">
              + {formatBRL(quote.extra_guest_total)} por hospede adicional ({quote.extra_guests} hospede(s) acima do incluido na tarifa).
            </p>
          )}
        </div>
      )}

      {sentCode && (
        <div className="mt-5 flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Solicitacao recebida: {sentCode}</p>
            <p className="mt-1 leading-6">
              {isPriceAvailable
                ? `Tarifa estimada ${totalLabel}. Nossa central confirma disponibilidade e a forma de garantia.`
                : 'Nossa central vai confirmar disponibilidade, tarifa final e garantia da reserva.'}
            </p>
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
        <div className="lg:col-span-12">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Periodo da estadia</label>
          <div className="mt-2">
            <RatesCalendar
              category={formData.category}
              value={{ check_in: formData.check_in, check_out: formData.check_out }}
              onChange={(v) =>
                setFormData((current) => ({
                  ...current,
                  check_in: v.check_in,
                  check_out: v.check_out,
                }))
              }
            />
          </div>
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
          <div className={`rounded-3xl px-4 py-3 text-sm ${isPriceAvailable ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
            <div className="flex items-center gap-2 font-bold">
              <CalendarRange className="h-4 w-4" />
              {isPriceAvailable ? 'Tarifa publica calculada' : 'Confirmacao manual'}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Users className="h-4 w-4" />
              {Number(formData.adults) + Number(formData.children)} hospede(s)
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !formData.check_in || !formData.check_out}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 text-sm font-bold text-white shadow-lg shadow-stone-950/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isPriceAvailable
              ? `Reservar por ${totalLabel}`
              : formData.check_in && formData.check_out
                ? 'Solicitar cotacao'
                : 'Selecione as datas'}
          </button>
        </div>
      </form>
    </div>
  );
}
