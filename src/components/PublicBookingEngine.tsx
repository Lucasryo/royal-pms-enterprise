import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CalendarRange, CheckCircle2, CreditCard, Loader2, QrCode, Send, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '../supabase';
import { toast } from 'sonner';
import RatesCalendar from './RatesCalendar';

const roomCategories = [
  { value: 'executivo', label: 'Executivo' },
  { value: 'master', label: 'Master' },
  { value: 'suite presidencial', label: 'Suite presidencial' },
];

type PaymentMethod = 'CREDIT_CARD' | 'PIX' | 'CASH';

const paymentMethods: Array<{ value: PaymentMethod; label: string; sub: string; icon: typeof CreditCard }> = [
  { value: 'CREDIT_CARD', label: 'Cartão de crédito', sub: 'Cobrança na chegada ou link', icon: CreditCard },
  { value: 'PIX', label: 'PIX', sub: 'Link enviado após confirmação', icon: QrCode },
  { value: 'CASH', label: 'Dinheiro', sub: 'Pagamento direto no check-in', icon: Banknote },
];

type QuoteBreakdown = { date: string; rate: number; label: string; weekend: boolean };

type Quote =
  | { ok: true; available: true; nights: number; total: number; nightly_total: number; extra_guest_total: number; extra_guests: number; breakdown: QuoteBreakdown[]; currency: string; slots_left?: number; inventory_total?: number }
  | { ok: true; available: false; nights: number; reason: string; sold_out?: boolean; full_dates?: string[]; slots_left?: number }
  | { ok: false; error: string };

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateShort = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    guest_name: '',
    contact_email: '',
    contact_phone: '',
    check_in: today,
    check_out: tomorrow,
    adults: 2,
    children: 0,
    category: 'executivo',
    payment_method: 'CREDIT_CARD' as PaymentMethod,
    notes: '',
  });

  // Close calendar on outside click
  useEffect(() => {
    if (!calendarOpen) return;
    function handleClick(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCalendarOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [calendarOpen]);

  // (auto-close handled in onChange of RatesCalendar — only after user picks check_out)

  // Fetch quote when relevant inputs change (debounced)
  useEffect(() => {
    if (!formData.check_in || !formData.check_out || formData.check_out <= formData.check_in) {
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
  const isSoldOut = quote && quote.ok && 'available' in quote && quote.available === false && (quote as { sold_out?: boolean }).sold_out === true;
  const slotsLeft = isPriceAvailable && typeof (quote as { slots_left?: number }).slots_left === 'number'
    ? (quote as { slots_left?: number }).slots_left
    : undefined;
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

      // Servidor pode bloquear por overbooking — sinaliza ao usuario sem criar request
      if (data?.blocked || data?.sold_out) {
        toast.error(data?.reason || 'Sem disponibilidade para essas datas.');
        setQuote({ ok: true, available: false, nights: 0, reason: data?.reason || 'Sem disponibilidade.', sold_out: true, full_dates: data?.full_dates });
        return;
      }

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

  const datesPicked = formData.check_in && formData.check_out;
  const totalGuests = Number(formData.adults) + Number(formData.children);

  return (
    <div className="rounded-[2rem] border border-stone-200 bg-white/85 p-6 shadow-[0_28px_90px_rgba(68,37,15,0.12)] backdrop-blur sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-amber-700">Reservas diretas</p>
          <h2 className="mt-2 font-display text-3xl leading-[1.05] tracking-[-0.02em] text-stone-950 sm:text-4xl">
            Reserve direto com o hotel.
          </h2>
          <p className="mt-3 text-sm leading-7 text-stone-600">
            Tarifa publica calculada na hora. A central confirma disponibilidade e garantia da reserva.
          </p>
        </div>

        {/* Price card */}
        <div className={`min-w-[260px] rounded-2xl px-5 py-4 text-white ${isPriceAvailable ? 'bg-stone-950' : isSoldOut ? 'bg-red-700' : 'bg-stone-700'}`}>
          {quoteLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">Calculando...</p>
            </div>
          ) : isPriceAvailable ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">Estimativa total</p>
              <p className="mt-1 font-display text-3xl font-light leading-tight">{totalLabel}</p>
              <p className="mt-1 text-xs text-white/65">
                {quote.nights} noite{quote.nights > 1 ? 's' : ''} · diaria media {formatBRL(quote.nightly_total / quote.nights)}
              </p>
              {typeof slotsLeft === 'number' && slotsLeft <= 5 && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                  Apenas {slotsLeft} disponivel{slotsLeft === 1 ? '' : 'is'}
                </p>
              )}
            </>
          ) : isSoldOut ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-200">Sem disponibilidade</p>
              <p className="mt-1 font-display text-xl font-light leading-tight">Lotado nestas datas</p>
              <p className="mt-1 text-xs text-white/85">{'reason' in quote ? quote.reason : 'Sem disponibilidade para essas datas.'}</p>
            </>
          ) : quote && quote.ok && !quote.available ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Cotacao manual</p>
              <p className="mt-1 text-sm leading-5 text-white/85">{'reason' in quote ? quote.reason : 'Cotacao manual necessaria.'}</p>
            </>
          ) : quote && !quote.ok ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300">Erro</p>
              <p className="mt-1 text-sm leading-5 text-white/85">{'error' in quote ? quote.error : 'Erro inesperado.'}</p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">Reserva direta</p>
              <p className="mt-1 font-display text-2xl font-light">Selecione as datas</p>
              <p className="mt-1 text-xs text-white/65">para ver o preco</p>
            </>
          )}
        </div>
      </div>

      {sentCode && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Solicitacao recebida: {sentCode}</p>
            <p className="mt-1 leading-6">
              {isPriceAvailable
                ? `Tarifa estimada ${totalLabel}. Nossa central confirma disponibilidade e a forma de garantia.`
                : 'Nossa central vai confirmar disponibilidade, tarifa final e garantia da reserva.'}
              {' '}Forma de pagamento escolhida: <strong>{paymentMethods.find((p) => p.value === formData.payment_method)?.label}</strong>.
            </p>
          </div>
        </div>
      )}

      {isSoldOut && !sentCode && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <CalendarRange className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Sem disponibilidade nas datas escolhidas.</p>
            <p className="mt-1 leading-6">
              {quote && 'reason' in quote ? quote.reason : 'Estamos lotados nesta categoria para o periodo solicitado.'}
              {' '}Experimente outras datas no calendario, ou fale conosco direto pelo WhatsApp para ver alternativas.
            </p>
            <a
              href={`https://wa.me/5522996105104?text=${encodeURIComponent(`Ola, gostaria de reservar ${formData.category} de ${formData.check_in} a ${formData.check_out} mas vi que esta lotado. Tem alguma alternativa?`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-800"
            >
              Falar no WhatsApp →
            </a>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        {/* Row 1: Datas + Adultos + Criancas + Categoria */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Date range trigger */}
          <div ref={calendarRef} className="relative lg:col-span-6">
            <Label>Periodo da estadia</Label>
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm transition hover:border-stone-300 hover:bg-white focus:border-amber-500 focus:bg-white focus:outline-none"
            >
              <div className="flex flex-1 items-center gap-3">
                <CalendarRange className="h-4 w-4 shrink-0 text-amber-700" />
                <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-bold text-stone-900">
                    {formData.check_in ? formatDateShort(formData.check_in) : '—'}
                  </span>
                  <span className="text-stone-400">→</span>
                  <span className="font-bold text-stone-900">
                    {formData.check_out ? formatDateShort(formData.check_out) : 'selecionar saida'}
                  </span>
                  {isPriceAvailable && (
                    <span className="text-[11px] uppercase tracking-widest text-stone-500">
                      · {quote.nights} noite{quote.nights > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-stone-400">
                {calendarOpen ? 'fechar' : 'alterar'}
              </span>
            </button>

            <AnimatePresence>
              {calendarOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="absolute left-0 right-0 top-full z-30 mt-2 lg:right-auto lg:w-[min(720px,calc(100vw-3rem))]"
                >
                  <RatesCalendar
                    category={formData.category}
                    value={{ check_in: formData.check_in, check_out: formData.check_out }}
                    onChange={(v) => {
                      setFormData((current) => ({
                        ...current,
                        check_in: v.check_in,
                        check_out: v.check_out,
                      }));
                      // Auto-close so when user completes a range (clicks check_out)
                      if (v.check_in && v.check_out && v.check_out > v.check_in) {
                        setTimeout(() => setCalendarOpen(false), 250);
                      }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Hospedes (combinado) */}
          <div className="lg:col-span-3">
            <Label>Hospedes</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-stone-400">Adultos</p>
                <input
                  required
                  type="number"
                  min={1}
                  max={8}
                  value={formData.adults}
                  onChange={(event) => setFormData({ ...formData, adults: Number(event.target.value) })}
                  className="mt-0.5 w-full bg-transparent text-base font-bold text-stone-900 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-stone-400">Criancas</p>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={formData.children}
                  onChange={(event) => setFormData({ ...formData, children: Number(event.target.value) })}
                  className="mt-0.5 w-full bg-transparent text-base font-bold text-stone-900 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Categoria */}
          <div className="lg:col-span-3">
            <Label>Categoria</Label>
            <select
              value={formData.category}
              onChange={(event) => setFormData({ ...formData, category: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-bold text-stone-900 outline-none transition focus:border-amber-500 focus:bg-white"
            >
              {roomCategories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Nome + Email + Telefone */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Nome completo</Label>
            <input
              required
              value={formData.guest_name}
              onChange={(event) => setFormData({ ...formData, guest_name: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
              placeholder="Hospede principal"
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <input
              required
              type="email"
              value={formData.contact_email}
              onChange={(event) => setFormData({ ...formData, contact_email: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <Label>Telefone / WhatsApp</Label>
            <input
              required
              value={formData.contact_phone}
              onChange={(event) => setFormData({ ...formData, contact_phone: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>

        {/* Row 3: Forma de pagamento */}
        <div>
          <Label>Forma de pagamento</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {paymentMethods.map((m) => {
              const selected = formData.payment_method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, payment_method: m.value })}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                      : 'border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white'
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-amber-700 text-white' : 'bg-white text-stone-700'}`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${selected ? 'text-amber-900' : 'text-stone-900'}`}>{m.label}</p>
                    <p className={`text-[11px] leading-4 ${selected ? 'text-amber-700' : 'text-stone-500'}`}>{m.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 4: Observacoes */}
        <div>
          <Label>Observacoes</Label>
          <textarea
            value={formData.notes}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
            rows={2}
            className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
            placeholder="Pedidos especiais, horario previsto, acessibilidade, garagem..."
          />
        </div>

        {/* Row 4: Submit row */}
        <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${isPriceAvailable ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              <CalendarRange className="h-3.5 w-3.5" />
              <span className="font-bold">
                {isPriceAvailable ? 'Tarifa publica calculada' : 'Confirmacao manual'}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
              <Users className="h-3.5 w-3.5" />
              <span className="font-bold">{totalGuests} hospede{totalGuests > 1 ? 's' : ''}</span>
            </div>
            {isPriceAvailable && quote.breakdown.length > 0 && (
              <details className="text-stone-500">
                <summary className="cursor-pointer text-xs font-bold underline-offset-4 hover:underline">
                  Ver desdobramento por noite
                </summary>
                <div className="mt-2 space-y-1 rounded-xl bg-stone-50 p-3 text-[11px]">
                  {quote.breakdown.map((b) => (
                    <div key={b.date} className="flex items-center justify-between gap-3">
                      <span>
                        {new Date(`${b.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                        <span className={`ml-2 text-[9px] uppercase tracking-widest ${b.weekend ? 'text-amber-700' : 'text-stone-400'}`}>
                          {b.label}{b.weekend ? ' · fds' : ''}
                        </span>
                      </span>
                      <span className="font-bold text-stone-900">{formatBRL(b.rate)}</span>
                    </div>
                  ))}
                  {quote.extra_guest_total > 0 && (
                    <div className="mt-2 border-t border-stone-200 pt-2 text-amber-800">
                      + {formatBRL(quote.extra_guest_total)} hospede(s) extra
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !datesPicked || isSoldOut}
            className={`group inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isSoldOut ? 'bg-red-700 hover:bg-red-800' : 'bg-stone-950 hover:bg-stone-800'
            }`}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>
              {isSoldOut
                ? 'Lotado — escolha outras datas'
                : isPriceAvailable
                  ? `Reservar por ${totalLabel}`
                  : datesPicked
                    ? 'Solicitar cotacao'
                    : 'Selecione as datas'}
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-stone-950 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{children}</label>;
}
