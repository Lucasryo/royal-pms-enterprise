import { Reservation, Company } from '../types';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  RoyalDocumentModal,
  RoyalDocumentPage,
  RoyalDocumentTable,
  RoyalInfoGrid,
  RoyalSummary,
} from './documents/RoyalDocument';

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
  const nights = Math.max(1, differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in)));
  const catKey = normalizeCategory(reservation.category || '');
  const subtotal = nights * Number(reservation.tariff || 0);
  const iss = Number(reservation.iss_tax || 0);
  const service = Number(reservation.service_tax || 0);
  const total = Number(reservation.total_amount || subtotal + iss + service);
  const code = reservation.reservation_code || reservation.id.slice(0, 8).toUpperCase();

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
        title="Voucher de Reserva"
        code={code}
        issuedAt={format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
        guestName={reservation.guest_name}
        rightMeta={[
          { label: 'UH', value: reservation.room_number || '' },
          { label: 'Adultos/Criancas', value: reservation.guests_per_uh || '' },
          { label: 'Entrada', value: format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR }) },
          { label: 'Saida', value: format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR }) },
          { label: 'Reserva', value: code },
        ]}
      >
        <RoyalDocumentTable headers={['Data', 'Descricao', 'Valor']} rows={tableRows} />

        <RoyalSummary>
          <RoyalInfoGrid
            rows={[
              { label: 'Empresa', value: company?.name || 'Particular' },
              { label: 'CNPJ', value: company?.cnpj },
              { label: 'Categoria', value: CATEGORY_LABELS[catKey] || reservation.category || '-' },
              { label: 'Diarias', value: nights },
              { label: 'Status', value: STATUS_LABELS[reservation.status] || reservation.status },
              { label: 'Pagamento', value: reservation.payment_method === 'VIRTUAL_CARD' ? 'Cartao Virtual' : 'Faturado' },
              { label: 'Telefone', value: reservation.contact_phone || '-' },
              { label: 'Centro custo', value: reservation.cost_center },
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
        </RoyalSummary>
      </RoyalDocumentPage>
    </RoyalDocumentModal>
  );
}
