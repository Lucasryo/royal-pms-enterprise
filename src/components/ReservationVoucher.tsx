import { useEffect, useState } from 'react';
import { Reservation, Company, VoucherHotelProfile } from '../types';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  RoyalDocumentModal,
  RoyalDocumentPage,
  RoyalDocumentTable,
  RoyalInfoGrid,
  RoyalSummary,
} from './documents/RoyalDocument';
import { supabase } from '../supabase';
import { DEFAULT_VOUCHER_HOTEL_PROFILE, deriveOccupancyType, getReservationPaxNames, OCCUPANCY_LABELS } from '../lib/voucher';

interface ReservationVoucherProps {
  reservation: Reservation;
  company?: Company;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
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

const normalizeCategory = (c: string) =>
  (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const formatBRL = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReservationVoucher({ reservation, company, onClose }: ReservationVoucherProps) {
  const [hotelProfile, setHotelProfile] = useState<VoucherHotelProfile>(DEFAULT_VOUCHER_HOTEL_PROFILE);
  const nights = Math.max(1, differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in)));
  const catKey = normalizeCategory(reservation.category || '');
  const subtotal = nights * Number(reservation.tariff || 0);
  const iss = Number(reservation.iss_tax || 0);
  const service = Number(reservation.service_tax || 0);
  const total = Number(reservation.total_amount || subtotal + iss + service);
  const code = reservation.reservation_code || reservation.id.slice(0, 8).toUpperCase();
  const paxNames = getReservationPaxNames(reservation);
  const occupancy = reservation.occupancy_type || deriveOccupancyType(reservation.guests_per_uh);

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
        // Fallback to the default hotel profile when settings are unavailable.
      }
    })();
    return () => { mounted = false; };
  }, []);

  const tableRows = [
    [
      format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR }),
      `Diaria ${CATEGORY_LABELS[catKey] || reservation.category || ''}`.trim(),
      formatBRL(subtotal),
    ],
    ...(iss > 0 ? [[format(new Date(), 'dd/MM/yyyy', { locale: ptBR }), 'ISS', formatBRL(iss)]] : []),
    ...(service > 0 ? [[format(new Date(), 'dd/MM/yyyy', { locale: ptBR }), 'Taxa de servico', formatBRL(service)]] : []),
  ];

  return (
    <RoyalDocumentModal
      title="Voucher de Reserva"
      subtitle={`${reservation.guest_name} - ${code}`}
      onClose={onClose}
    >
      <RoyalDocumentPage
        title="Autorizacao de Hospedagem"
        code={code}
        issuedAt={format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
        guestName={paxNames[0] || reservation.guest_name}
        rightMeta={[
          { label: 'UH', value: reservation.room_number || '' },
          { label: 'Ocupacao', value: OCCUPANCY_LABELS[occupancy] || occupancy },
          { label: 'Entrada', value: format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR }) },
          { label: 'Saida', value: format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR }) },
          { label: 'Reserva', value: code },
        ]}
      >
        <RoyalSummary>
          <RoyalInfoGrid
            rows={[
              { label: 'Hotel', value: hotelProfile.trade_name },
              { label: 'Razao social', value: hotelProfile.legal_name },
              { label: 'CNPJ hotel', value: hotelProfile.cnpj },
              { label: 'Endereco hotel', value: hotelProfile.address },
              { label: 'Telefone hotel', value: hotelProfile.phone },
              { label: 'E-mail hotel', value: hotelProfile.email },
            ]}
          />
        </RoyalSummary>

        <RoyalSummary>
          <RoyalInfoGrid
            rows={paxNames.map((name, index) => ({
              label: index === 0 ? 'PAX principal' : `PAX ${index + 1}`,
              value: name,
            }))}
          />
        </RoyalSummary>

        <RoyalDocumentTable headers={['Data', 'Descricao', 'Valor']} rows={tableRows} />

        <RoyalSummary>
          <RoyalInfoGrid
            rows={[
              { label: 'Empresa', value: company?.name || 'Particular' },
              { label: 'CNPJ', value: company?.cnpj },
              { label: 'Categoria', value: CATEGORY_LABELS[catKey] || reservation.category || '-' },
              { label: 'Diarias', value: nights },
              { label: 'Data solicitacao', value: reservation.created_at ? format(new Date(reservation.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-' },
              { label: 'Ocupacao', value: OCCUPANCY_LABELS[occupancy] || occupancy },
              { label: 'Status', value: STATUS_LABELS[reservation.status] || reservation.status },
              { label: 'Pagamento', value: reservation.payment_method === 'VIRTUAL_CARD' ? 'Cartao Virtual' : 'Faturado' },
              { label: 'Telefone', value: reservation.contact_phone || '-' },
              { label: 'Centro custo', value: reservation.cost_center },
              { label: 'Dados fiscais/NF', value: reservation.billing_info || reservation.fiscal_data || '-' },
            ]}
          />
          <div className="mt-8 flex justify-end">
            <div className="w-72 border-t border-neutral-900 pt-2 text-xs">
              <div className="flex justify-between py-1">
                <span>Subtotal</span>
                <span className="font-bold tabular-nums">{formatBRL(subtotal)}</span>
              </div>
              {iss > 0 && (
                <div className="flex justify-between py-1">
                  <span>ISS</span>
                  <span className="font-bold tabular-nums">{formatBRL(iss)}</span>
                </div>
              )}
              {service > 0 && (
                <div className="flex justify-between py-1">
                  <span>Taxa de servico</span>
                  <span className="font-bold tabular-nums">{formatBRL(service)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-neutral-900 py-2 text-sm font-black">
                <span>Total</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </div>
            </div>
          </div>
          {reservation.billing_obs && (
            <p className="mt-8 whitespace-pre-line text-[11px] leading-5 text-neutral-700">{reservation.billing_obs}</p>
          )}
          {hotelProfile.notes && (
            <p className="mt-4 whitespace-pre-line border-t border-neutral-200 pt-4 text-[10px] font-bold leading-5 text-neutral-500">{hotelProfile.notes}</p>
          )}
        </RoyalSummary>
      </RoyalDocumentPage>
    </RoyalDocumentModal>
  );
}
