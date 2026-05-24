import { useEffect, useState } from 'react';
import { Reservation, Company, VoucherHotelProfile } from '../types';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

function Barcode({ value }: { value: string }) {
  const chars = value.padEnd(18, '0').slice(0, 18).split('');
  return (
    <div className="flex h-12 items-end gap-[2px]">
      {chars.map((char, index) => {
        const digit = char.charCodeAt(0) % 5;
        const width = digit % 2 === 0 ? 'w-[2px]' : 'w-[4px]';
        const height = digit < 2 ? 'h-10' : 'h-12';
        return <span key={`${char}-${index}`} className={`${width} ${height} bg-neutral-950`} />;
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[31mm_1fr] gap-2 border-b border-neutral-200 py-1.5 text-[10px]">
      <span className="font-black uppercase text-neutral-900">{label}</span>
      <span className="font-bold text-neutral-700">{value || '-'}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 border-y border-blue-300 bg-blue-50 px-2 py-1 text-[12px] font-black uppercase text-neutral-950">
      {children}
    </div>
  );
}

function CompactTable({ rows }: { rows: Array<[React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode]> }) {
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead>
        <tr className="bg-blue-100 text-left font-black">
          <th className="px-2 py-1">Item</th>
          <th className="px-2 py-1">Detalhe</th>
          <th className="px-2 py-1 text-right">Quantidade</th>
          <th className="px-2 py-1 text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-neutral-100">
            <td className="px-2 py-1.5 font-bold">{row[0]}</td>
            <td className="px-2 py-1.5">{row[1]}</td>
            <td className="px-2 py-1.5 text-right">{row[2]}</td>
            <td className="px-2 py-1.5 text-right font-bold tabular-nums">{row[3]}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
        className="nota-printable mx-auto bg-white text-neutral-950 shadow-sm"
        style={{ width: '210mm', minHeight: '297mm', padding: '9mm 9mm 7mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        <header className="border-b-2 border-blue-400 pb-3">
          <div className="grid grid-cols-[42mm_1fr_58mm] items-start gap-4">
            <div>
              <img src={hotelProfile.logo_url || '/logo.png'} alt="Royal Macae" className="h-16 w-32 object-contain object-left" />
            </div>
            <div className="pt-2">
              <h1 className="text-[25px] font-black leading-none text-blue-950">Voucher</h1>
              <p className="mt-1 text-[13px] font-black text-blue-950">Documentacao de Hospedagem</p>
              <p className="mt-3 text-[10px] font-bold text-neutral-600">{hotelProfile.trade_name || hotelProfile.legal_name}</p>
            </div>
            <div className="text-right">
              <div className="flex justify-end">
                <Barcode value={code} />
              </div>
              <p className="mt-1 text-[9px] font-bold text-neutral-500">{code}</p>
              <p className="text-[8px] text-neutral-500">Este numero garante a validade deste documento</p>
            </div>
          </div>
        </header>

        <section className="mt-3 grid grid-cols-[62mm_1fr] gap-4">
          <div>
            <InfoRow label="Codigo da reserva" value={code} />
            <InfoRow label="Status" value={status} />
            <InfoRow label="Empresa" value={company?.name || 'Particular'} />
            <InfoRow label="Emitido em" value={format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} />
          </div>
          <div>
            <InfoRow label="Hotel" value={hotelProfile.trade_name || hotelProfile.legal_name} />
            <InfoRow label="Endereco" value={hotelProfile.address} />
            <InfoRow label="Telefone" value={hotelProfile.phone} />
            <InfoRow label="CNPJ" value={hotelProfile.cnpj} />
          </div>
        </section>

        <SectionTitle>NOME DOS PASSAGEIROS / HOSPEDES</SectionTitle>
        <div className="px-2 py-2 text-[11px]">
          {paxNames.map((name, index) => (
            <p key={`${name}-${index}`} className="font-bold uppercase">
              {name} <span className="font-normal">- [ LOCALIZADOR: {code} ]</span>
            </p>
          ))}
        </div>

        <SectionTitle>DETALHES DA HOSPEDAGEM</SectionTitle>
        <div className="grid grid-cols-[1fr_66mm] gap-6 px-2 py-2 text-[11px]">
          <div>
            <InfoRow label="Hotel" value={hotelProfile.trade_name || hotelProfile.legal_name} />
            <InfoRow label="Endereco" value={hotelProfile.address} />
            <InfoRow label="Telefone" value={hotelProfile.phone} />
            <InfoRow label="Tipo de acomodacao" value={`${category} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`} />
            <InfoRow label="UH" value={reservation.room_number || 'A definir'} />
          </div>
          <div>
            <InfoRow label="Data de entrada" value={formatDate(reservation.check_in)} />
            <InfoRow label="Data de saida" value={formatDate(reservation.check_out)} />
            <InfoRow label="Diarias" value={nights} />
            <InfoRow label="Observacao" value={reservation.billing_obs || 'Apresentar no check-in.'} />
          </div>
        </div>

        <SectionTitle>DETALHES DO RECEPTIVO / EMPRESA</SectionTitle>
        <div className="grid grid-cols-3 bg-blue-50 text-[10px] font-black">
          <div className="px-2 py-1">Empresa</div>
          <div className="px-2 py-1">Centro de custo</div>
          <div className="px-2 py-1">Telefone</div>
        </div>
        <div className="grid grid-cols-3 text-[10px]">
          <div className="px-2 py-1">{company?.name || '-'}</div>
          <div className="px-2 py-1">{reservation.cost_center || '-'}</div>
          <div className="px-2 py-1">{reservation.contact_phone || company?.phone || '-'}</div>
        </div>

        <SectionTitle>SERVICOS INCLUSOS E VALORES PREVISTOS</SectionTitle>
        <CompactTable
          rows={[
            ['Hospedagem', `${category} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`, `${nights} diaria(s)`, formatBRL(subtotal)],
            ...(iss > 0 ? [['ISS', 'Imposto sobre servico', '1', formatBRL(iss)] as [string, string, string, string]] : []),
            ...(service > 0 ? [['Taxa', 'Taxa de servico', '1', formatBRL(service)] as [string, string, string, string]] : []),
            ['Total previsto', 'Sujeito a validacao operacional', '', formatBRL(total)],
          ]}
        />

        <SectionTitle>INFORMACOES PARA FATURAMENTO</SectionTitle>
        <div className="grid grid-cols-2 gap-4 px-2 py-2 text-[10px] leading-5">
          <div>
            <p className="font-black uppercase">Dados fiscais / nota</p>
            <p className="mt-1 whitespace-pre-line">{reservation.billing_info || reservation.fiscal_data || 'Utilizar dados cadastrais da empresa.'}</p>
          </div>
          <div>
            <p className="font-black uppercase">Instrucoes adicionais</p>
            <p className="mt-1 whitespace-pre-line">{reservation.billing_obs || hotelProfile.notes || 'Reserva sujeita a disponibilidade, politica comercial vigente e validacao do setor de reservas.'}</p>
          </div>
        </div>

        <footer className="mt-16">
          <div className="border-y border-dashed border-neutral-300 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Protocolo de entrega do voucher
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr] gap-8 bg-blue-50 p-3 text-[10px]">
            <div>
              <InfoRow label="Codigo reserva" value={code} />
              <InfoRow label="Hospede" value={paxNames[0] || reservation.guest_name} />
              <InfoRow label="Entrada" value={formatDate(reservation.check_in)} />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-2">
              <div className="border-t border-neutral-700 pt-1 text-center">DATA</div>
              <div className="border-t border-neutral-700 pt-1 text-center">NOME</div>
              <div className="border-t border-neutral-700 pt-1 text-center">DOCUMENTO</div>
              <div className="border-t border-neutral-700 pt-1 text-center">ASSINATURA</div>
            </div>
          </div>
          <p className="mt-3 text-center text-[9px] font-bold text-neutral-500">
            {[hotelProfile.website, hotelProfile.email].filter(Boolean).join(' - ') || 'Voucher corporativo'}
          </p>
        </footer>
      </section>
    </RoyalDocumentModal>
  );
}
