import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Hotel, Users } from 'lucide-react';
import { supabase } from '../supabase';
import { HotelEvent, Reservation } from '../types';

type CalendarItem = {
  id: string;
  date: string;
  title: string;
  type: 'event' | 'arrival' | 'departure';
  meta: string;
};

export default function SharedHotelCalendar({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<HotelEvent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalendar();
  }, []);

  async function fetchCalendar() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const nextDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const [eventRes, reservationRes] = await Promise.all([
      supabase.from('hotel_events').select('*').lte('start_date', nextDate).gte('end_date', today).order('start_date'),
      supabase.from('reservations').select('*').or(`check_in.gte.${today},check_out.gte.${today}`).order('check_in').limit(40),
    ]);
    if (eventRes.data) setEvents(eventRes.data as HotelEvent[]);
    if (reservationRes.data) setReservations(reservationRes.data as Reservation[]);
    setLoading(false);
  }

  const items = useMemo(() => {
    const rows: CalendarItem[] = [];
    events.forEach((event) => {
      rows.push({
        id: `event-${event.id}`,
        date: event.start_date,
        title: event.name,
        type: 'event',
        meta: `${event.hall_name} - ${event.status} - ${event.attendees_count || 0} pax`,
      });
    });
    reservations.forEach((reservation) => {
      if (reservation.check_in) {
        rows.push({
          id: `arrival-${reservation.id}`,
          date: reservation.check_in,
          title: reservation.guest_name,
          type: 'arrival',
          meta: `Chegada ${reservation.reservation_code} - UH ${reservation.room_number || reservation.category}`,
        });
      }
      if (reservation.check_out) {
        rows.push({
          id: `departure-${reservation.id}`,
          date: reservation.check_out,
          title: reservation.guest_name,
          type: 'departure',
          meta: `Saida ${reservation.reservation_code} - UH ${reservation.room_number || reservation.category}`,
        });
      }
    });
    return rows
      .filter((item) => item.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, compact ? 6 : 12);
  }, [compact, events, reservations]);

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Calendario espelhado</p>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Agenda viva do hotel</h3>
          <p className="mt-1 text-sm text-neutral-500">Eventos, chegadas e saidas visiveis para todos os setores.</p>
        </div>
        <button onClick={fetchCalendar} className="rounded-2xl bg-neutral-950 px-4 py-2 text-xs font-black text-white">
          Atualizar
        </button>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {loading ? (
          <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-400">Carregando calendario...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm font-bold text-neutral-400">
            Nenhum evento, chegada ou saida nos proximos dias.
          </div>
        ) : items.map((item) => {
          const Icon = item.type === 'event' ? Users : item.type === 'arrival' ? Hotel : CalendarDays;
          const color = item.type === 'event' ? 'bg-amber-50 text-amber-700' : item.type === 'arrival' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700';
          return (
            <div key={item.id} className="rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-xl p-2 ${color}`}><Icon className="h-4 w-4" /></span>
                <p className="text-xs font-black uppercase tracking-widest text-neutral-400">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</p>
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
