import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Hotel, Users } from 'lucide-react';
import { supabase } from '../supabase';
import { HotelEvent, Reservation } from '../types';
import { format, addDays } from 'date-fns';

type CalendarItem = {
  id: string;
  date: string;
  title: string;
  type: 'event' | 'arrival' | 'departure';
  meta: string;
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SharedHotelCalendar({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<HotelEvent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalendar();
  }, []);

  async function fetchCalendar() {
    setLoading(true);
    const today = localToday();
    const horizon = format(addDays(new Date(), 14), 'yyyy-MM-dd');

    const [eventRes, reservationRes] = await Promise.all([
      supabase
        .from('hotel_events')
        .select('*')
        .neq('status', 'cancelled')
        .eq('is_quote', false)
        .lte('start_date', horizon)
        .gte('end_date', today)
        .order('start_date'),
      supabase
        .from('reservations')
        .select('*')
        .neq('status', 'CANCELLED')
        .or(`check_in.gte.${today},check_out.gte.${today}`)
        .order('check_in')
        .limit(60),
    ]);

    if (eventRes.data) setEvents(eventRes.data as HotelEvent[]);
    if (reservationRes.data) setReservations(reservationRes.data as Reservation[]);
    setLoading(false);
  }

  const items = useMemo(() => {
    const today = localToday();
    const rows: CalendarItem[] = [];

    events.forEach((event) => {
      rows.push({
        id: `event-${event.id}`,
        date: event.start_date,
        title: event.name,
        type: 'event',
        meta: `${(event.halls && event.halls.length > 0) ? event.halls.join(' · ') : event.hall_name} · ${event.attendees_count || 0} pax`,
      });
    });

    reservations.forEach((reservation) => {
      // Arrivals: check_in must be today or in the future
      if (reservation.check_in && reservation.check_in >= today) {
        rows.push({
          id: `arrival-${reservation.id}`,
          date: reservation.check_in,
          title: reservation.guest_name,
          type: 'arrival',
          meta: `Chegada ${reservation.reservation_code} · UH ${reservation.room_number || reservation.category}`,
        });
      }
      // Departures: check_out must be today or in the future
      if (reservation.check_out && reservation.check_out >= today) {
        rows.push({
          id: `departure-${reservation.id}`,
          date: reservation.check_out,
          title: reservation.guest_name,
          type: 'departure',
          meta: `Saída ${reservation.reservation_code} · UH ${reservation.room_number || reservation.category}`,
        });
      }
    });

    return rows
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, compact ? 6 : 12);
  }, [compact, events, reservations]);

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Calendario espelhado</p>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Agenda viva do hotel</h3>
          <p className="mt-1 text-sm text-neutral-500">Eventos, chegadas e saídas visíveis para todos os setores.</p>
        </div>
        <button onClick={fetchCalendar} className="rounded-2xl bg-neutral-950 px-4 py-2 text-xs font-black text-white">
          Atualizar
        </button>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {loading ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-400">Carregando calendário...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm font-bold text-neutral-400">
            Nenhum evento, chegada ou saída nos próximos dias.
          </div>
        ) : items.map((item) => {
          const Icon = item.type === 'event' ? Users : item.type === 'arrival' ? Hotel : CalendarDays;
          const color =
            item.type === 'event'
              ? 'bg-amber-50 text-amber-700'
              : item.type === 'arrival'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-blue-50 text-blue-700';
          return (
            <div key={item.id} className="rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-xl p-2 ${color}`}><Icon className="h-4 w-4" /></span>
                <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <p className="mt-3 font-black text-neutral-950">{item.title}</p>
              <p className="mt-1 text-sm text-neutral-500">{item.meta}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
