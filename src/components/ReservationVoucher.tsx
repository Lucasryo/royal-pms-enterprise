import { useEffect, useState } from 'react';
import { Reservation, Company, VoucherHotelProfile } from '../types';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, CalendarDays, CreditCard, MapPin, Moon, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { RoyalDocumentModal } from './documents/RoyalDocument';
import { supabase } from '../supabase';
import { DEFAULT_VOUCHER_HOTEL_PROFILE, deriveOccupancyType, getReservationPaxNames, OCCUPANCY_LABELS } from '../lib/voucher';

interface ReservationVoucherProps {
  reservation: Reservation;
  company?: Company;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
  superior: 'Superior',
  master: 'Master',
  'suite presidencial': 'Suite Presidencial',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Check-in Realizado',
  CHECKED_OUT: 'Check-out Realizado',
  CANCELLED: 'Cancelada',
};

const normalizeCategory = (value: string) =>
  (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const formatBRL = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value?: string) =>
  value ? format(new Date(value), 'dd/MM/yyyy', { locale: ptBR }) : '-';

function VoucherMiniCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-black text-neutral-950">{value || '-'}</p>
    </div>
  );
}

function VoucherSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-amber-700">{title}</h3>
      {children}
    </section>
  );
}

export default function ReservationVoucher({ reservation, company, onClose }: ReservationVoucherProps) {
  const [hotelProfile, setHotelProfile] = useState<VoucherHotelProfile>(DEFAULT_VOUCHER_HOTEL_PROFILE);
  const nights = Math.max(1, differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in)));
  const category = CATEGORY_LABELS[normalizeCategory(reservation.category || '')] || reservation.category || '-';
  const code = reservation.reservation_code || reservation.id.slice(0, 8).toUpperCase();
  const paxNames = getReservationPaxNames(reservation);
  const occupancy = reservation.occupancy_type || deriveOccupancyType(reservation.guests_per_uh);
  const subtotal = nights * Number(reservation.tariff || 0);
  const iss = Number(reservation.iss_tax || 0);
  const service = Number(reservation.service_tax || 0);
  const total = Number(reservation.total_amount || subtotal + iss + service);
  const status = STATUS_LABELS[reservation.status] || reservation.status;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('id', 'voucher_hotel_profile')
          .maybeSingle();
        if (!mounted || !data?.value) return;
        const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setHotelProfile({ ...DEFAULT_VOUCHER_HOTEL_PROFILE, ...raw });
      } catch {
        // Keep default profile when settings are unavailable.
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <RoyalDocumentModal
      title="Voucher de Reserva"
      subtitle={`${code} - ${paxNames[0] || reservation.guest_name}`}
      onClose={onClose}
    >
      <section
        className="nota-printable relative mx-auto overflow-hidden bg-white text-neutral-950 shadow-sm"
        style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        <div className="absolute inset-y-0 left-0 w-[18mm] bg-neutral-950" />
        <div className="absolute left-[18mm] top-0 h-[8mm] w-[192mm] bg-amber-600" />

        <div className="relative ml-[18mm] px-[12mm] pb-[10mm] pt-[16mm]">
          <header className="grid grid-cols-[1fr_54mm] gap-8 border-b border-neutral-200 pb-7">
            <div>
              <img src={hotelProfile.logo_url || '/logo.png'} alt="Royal Macae" className="mb-5 h-14 w-28 object-contain" />
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-700">Voucher oficial de reserva</p>
              <h1 className="mt-2 text-[30px] font-black uppercase leading-none tracking-tight text-neutral-950">Hospedagem Confirmada</h1>
              <p className="mt-3 max-w-[112mm] text-sm font-bold leading-6 text-neutral-600">
                Documento de apresentacao para recepcao, reservas e faturamento corporativo.
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-950 p-4 text-white">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/50">Localizador</p>
              <p className="mt-1 break-all font-mono text-2xl font-black tracking-widest">{code}</p>
              <div className="mt-5 rounded-xl bg-emerald-500/15 px-3 py-2 text-emerald-100 ring-1 ring-emerald-400/20">
                <p className="text-[9px] font-black uppercase tracking-widest">Status</p>
                <p className="mt-1 text-sm font-black">{status}</p>
              </div>
            </div>
          </header>

          <div className="mt-6 grid grid-cols-[1.1fr_0.9fr] gap-5">
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-amber-700 ring-1 ring-neutral-200">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-neutral-400">Periodo da estadia</p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-neutral-400">Entrada</p>
                      <p className="mt-1 text-2xl font-black">{formatDate(reservation.check_in)}</p>
                    </div>
                    <div className="rounded-full bg-neutral-950 px-3 py-1 text-[10px] font-black uppercase text-white">{nights} noite(s)</div>
                    <div>
                      <p className="text-xs font-black uppercase text-neutral-400">Saida</p>
                      <p className="mt-1 text-2xl font-black">{formatDate(reservation.check_out)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-neutral-400">Hospede principal</p>
              <div className="mt-3 flex items-start gap-3">
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-black leading-tight">{paxNames[0] || reservation.guest_name}</p>
                  <p className="mt-1 text-xs font-bold text-neutral-500">{OCCUPANCY_LABELS[occupancy] || occupancy}</p>
                </div>
              </div>
            </div>
          </div>

          <VoucherSection title="Detalhes da reserva">
            <div className="grid grid-cols-4 gap-3">
              <VoucherMiniCard label="Tipo de UH" value={category} />
              <VoucherMiniCard label="UH" value={reservation.room_number || 'A definir'} />
              <VoucherMiniCard label="Pessoas/UH" value={reservation.guests_per_uh || paxNames.length || 1} />
              <VoucherMiniCard label="Telefone" value={reservation.contact_phone || company?.phone || '-'} />
            </div>
          </VoucherSection>

          <VoucherSection title="PAX autorizados">
            <div className="grid grid-cols-2 gap-2">
              {paxNames.map((name, index) => (
                <div key={`${name}-${index}`} className="rounded-xl bg-neutral-50 px-4 py-3 text-sm font-black ring-1 ring-neutral-200">
                  {index + 1}. {name}
                </div>
              ))}
            </div>
          </VoucherSection>

          <VoucherSection title="Empresa e faturamento">
            <div className="grid grid-cols-[1fr_68mm] gap-4">
              <div className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <p className="text-lg font-black">{company?.name || 'Particular'}</p>
                    <p className="mt-1 text-xs font-bold text-neutral-500">CNPJ: {company?.cnpj || '-'}</p>
                    <p className="mt-1 text-xs font-bold text-neutral-500">Centro de custo: {reservation.cost_center || '-'}</p>
                  </div>
                </div>
                {(reservation.billing_info || reservation.fiscal_data) && (
                  <p className="mt-4 whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-xs font-bold leading-5 text-neutral-600">
                    {reservation.billing_info || reservation.fiscal_data}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-neutral-950 p-4 text-white">
                <div className="flex items-center gap-2 text-white/60">
                  <CreditCard className="h-4 w-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Pagamento</p>
                </div>
                <p className="mt-3 text-lg font-black">{reservation.payment_method === 'VIRTUAL_CARD' ? 'Cartao virtual' : 'Faturado'}</p>
                <div className="mt-5 space-y-2 text-xs">
                  <div className="flex justify-between"><span>Diaria acordo</span><strong>{formatBRL(Number(reservation.tariff || 0))}</strong></div>
                  <div className="flex justify-between"><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div>
                  {iss > 0 && <div className="flex justify-between"><span>ISS</span><strong>{formatBRL(iss)}</strong></div>}
                  {service > 0 && <div className="flex justify-between"><span>Taxa</span><strong>{formatBRL(service)}</strong></div>}
                  <div className="flex justify-between border-t border-white/20 pt-3 text-base"><span>Total previsto</span><strong>{formatBRL(total)}</strong></div>
                </div>
              </div>
            </div>
          </VoucherSection>

          <VoucherSection title="Hotel">
            <div className="grid grid-cols-[1fr_1fr] gap-4 rounded-2xl border border-neutral-200 p-4 text-xs font-bold text-neutral-600">
              <div className="flex gap-2"><MapPin className="h-4 w-4 text-amber-700" /> {hotelProfile.address || '-'}</div>
              <div className="flex gap-2"><Phone className="h-4 w-4 text-amber-700" /> {hotelProfile.phone || '-'} | {hotelProfile.email || '-'}</div>
              <div>CNPJ: {hotelProfile.cnpj || '-'}</div>
              <div>Site: {hotelProfile.website || '-'}</div>
            </div>
          </VoucherSection>

          {reservation.billing_obs && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-950">
              {reservation.billing_obs}
            </div>
          )}

          <footer className="mt-10 grid grid-cols-[1fr_1fr] gap-8 text-xs text-neutral-500">
            <div className="border-t border-neutral-300 pt-3">
              <p className="font-black uppercase tracking-widest text-neutral-800">Reservas / Recepcao</p>
              <p className="mt-1">{hotelProfile.trade_name}</p>
            </div>
            <div className="border-t border-neutral-300 pt-3">
              <p className="font-black uppercase tracking-widest text-neutral-800">Cliente / Empresa</p>
              <p className="mt-1">Apresentar este voucher no check-in quando solicitado.</p>
            </div>
          </footer>
        </div>

        <div className="absolute bottom-[12mm] left-[7mm] flex origin-left -rotate-90 items-center gap-2 text-white">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">Royal PMS</span>
        </div>
        <div className="absolute bottom-[7mm] right-[12mm] flex items-center gap-2 text-[10px] font-bold text-neutral-400">
          <Moon className="h-3.5 w-3.5" />
          Emitido em {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
        </div>
      </section>
    </RoyalDocumentModal>
  );
}
