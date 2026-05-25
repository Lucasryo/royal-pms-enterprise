import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Company, CompanyBillingProfile, FiscalFile, UserProfile, Notification, Reservation, ReservationRequest, Tariff, VoucherHotelProfile } from '../types';
import { FileText, Search, Loader2, Download, Filter, CheckCircle2, Clock, Sparkles, Eye, X, Bell, BellOff, Receipt, AlertTriangle, Image as ImageIcon, Send, Upload, Calendar, Plus, Mail, Building2, User, Printer, ShieldCheck, Ban, CreditCard, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { logAudit, sendNotification } from '../lib/audit';
import { format, addDays } from 'date-fns';
import jsPDF from 'jspdf';
import { DEFAULT_VOUCHER_HOTEL_PROFILE, deriveOccupancyType, getReservationPaxNames, OCCUPANCY_LABELS } from '../lib/voucher';

const FINANCIAL_TYPES = ['FATURA', 'Hospedagem', 'Alimentação', 'Lavanderia', 'Eventos', 'Transporte'];

function ClientPortalKpi({ label, value, tone = 'neutral' }: { label: string; value: React.ReactNode; tone?: 'neutral' | 'emerald' | 'amber' | 'red' | 'ink' }) {
  const tones = {
    neutral: 'bg-white text-neutral-900 ring-neutral-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-800 ring-amber-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    ink: 'bg-neutral-950 text-white ring-neutral-950',
  };
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-2 text-lg font-black tracking-tight sm:text-xl">{value}</p>
    </div>
  );
}

function VoucherField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-1 font-black text-neutral-950">{value || '-'}</p>
    </div>
  );
}

function VoucherMetric({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`${strong ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-950'} rounded-2xl p-4`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-2 text-base font-black">{value || '-'}</p>
    </div>
  );
}

function VoucherNote({ title, text }: { title: string; text: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.22em] text-neutral-500">{title}</p>
      <p className="mt-3 whitespace-pre-line text-xs font-medium leading-5 text-neutral-700">{text}</p>
    </div>
  );
}

function TravelVoucherPreview({
  voucher,
  company,
  hotelProfile,
}: {
  voucher: Reservation | ReservationRequest;
  company: Company | null;
  hotelProfile: VoucherHotelProfile;
}) {
  const code = voucher.reservation_code || 'PENDENTE';
  const paxNames = getReservationPaxNames(voucher);
  const occupancy = voucher.occupancy_type || deriveOccupancyType(voucher.guests_per_uh);
  const nights = Math.max(1, Math.ceil((new Date(voucher.check_out).getTime() - new Date(voucher.check_in).getTime()) / 86400000));
  const totals = calculateReservationTotal({
    tariff: Number(voucher.tariff || 0),
    iss_enabled: Number(voucher.iss_tax || 0) > 0,
    iss_tax: Number(voucher.iss_tax || 0),
    service_enabled: Number(voucher.service_tax || 0) > 0,
    service_tax: Number(voucher.service_tax || 0),
  });
  const barcodeBars = code.padEnd(20, '0').slice(0, 20).split('');
  const status = (voucher as ReservationRequest).status === 'REQUESTED' ? 'Reserva em analise' : 'Reserva confirmada';

  return (
    <div id="voucher-print" className="bg-white p-4 sm:p-6">
      <div className="mx-auto min-h-[760px] max-w-[820px] rounded-sm border border-blue-200 bg-white p-5 text-neutral-950 shadow-sm">
        <header className="border-b-2 border-blue-400 pb-3">
          <div className="grid grid-cols-[130px_1fr_190px] items-start gap-5">
            <img src={hotelProfile.logo_url || '/logo.png'} alt="Royal Macae" className="h-16 w-28 object-contain object-left" />
            <div className="pt-2">
              <h2 className="text-3xl font-black leading-none text-blue-950">Voucher</h2>
              <p className="mt-1 text-sm font-black text-blue-950">Documentacao de Hospedagem</p>
              <p className="mt-3 text-xs font-bold text-neutral-500">{hotelProfile.trade_name || hotelProfile.legal_name || 'Royal Macae Palace Hotel'}</p>
            </div>
            <div className="text-right">
              <div className="flex h-12 justify-end gap-[2px]">
                {barcodeBars.map((char, index) => (
                  <span
                    key={`${char}-${index}`}
                    className={`${char.charCodeAt(0) % 2 === 0 ? 'w-[2px]' : 'w-[4px]'} ${char.charCodeAt(0) % 3 === 0 ? 'h-10' : 'h-12'} bg-neutral-950`}
                  />
                ))}
              </div>
              <p className="mt-1 text-[10px] font-bold text-neutral-500">{code}</p>
              <p className="text-[9px] text-neutral-500">Este numero garante a validade deste documento</p>
            </div>
          </div>
        </header>

        <section className="mt-3 grid grid-cols-[250px_1fr] gap-5 text-xs">
          <div className="space-y-1">
            <p><strong>CODIGO DA RESERVA</strong><span className="ml-8">{code}</span></p>
            <p><strong>STATUS</strong><span className="ml-[77px]">{status}</span></p>
            <p><strong>EMPRESA</strong><span className="ml-[67px]">{company?.name || 'Particular'}</span></p>
            <p><strong>SOLICITANTE</strong><span className="ml-[42px]">{voucher.requested_by || '-'}</span></p>
            <p><strong>EMITIDO EM</strong><span className="ml-[48px]">{new Date().toLocaleString('pt-BR')}</span></p>
          </div>
          <div className="space-y-1">
            <p><strong>HOTEL</strong><span className="ml-[70px]">{hotelProfile.trade_name || hotelProfile.legal_name}</span></p>
            <p><strong>ENDERECO</strong><span className="ml-[46px]">{hotelProfile.address || '-'}</span></p>
            <p><strong>TELEFONE</strong><span className="ml-[50px]">{hotelProfile.phone || '-'}</span></p>
            <p><strong>CNPJ</strong><span className="ml-[75px]">{hotelProfile.cnpj || '-'}</span></p>
          </div>
        </section>

        <div className="mt-5 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">Nome dos passageiros / hospedes</div>
        <div className="px-2 py-2 text-xs">
          {paxNames.map((name, index) => (
            <p key={`${name}-${index}`} className="font-bold uppercase">{name} <span className="font-normal">- [ LOCALIZADOR: {code} ]</span></p>
          ))}
        </div>

        <div className="mt-4 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">Detalhes da hospedagem</div>
        <div className="grid grid-cols-[1fr_250px] gap-5 px-2 py-2 text-xs">
          <div className="space-y-1">
            <p><strong>HOTEL:</strong> {hotelProfile.trade_name || hotelProfile.legal_name}</p>
            <p><strong>ENDERECO:</strong> {hotelProfile.address || '-'}</p>
            <p><strong>TELEFONE:</strong> {hotelProfile.phone || '-'}</p>
            <p><strong>TIPO DE ACOMODACAO:</strong> {voucher.category || '-'} - {OCCUPANCY_LABELS[occupancy] || occupancy}</p>
          </div>
          <div className="space-y-1">
            <p><strong>DATA DE ENTRADA:</strong> {clientDate(voucher.check_in)}</p>
            <p><strong>DATA DE SAIDA:</strong> {clientDate(voucher.check_out)}</p>
            <p><strong>DIARIAS:</strong> {nights}</p>
            <p><strong>OBSERVACAO:</strong> Apresentar no check-in</p>
          </div>
        </div>

        <div className="mt-4 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">Detalhes do receptivo / empresa</div>
        <div className="grid grid-cols-3 bg-blue-50 text-xs font-black">
          <div className="px-2 py-1">Empresa</div>
          <div className="px-2 py-1">Centro de custo</div>
          <div className="px-2 py-1">Telefone</div>
        </div>
        <div className="grid grid-cols-3 text-xs">
          <div className="px-2 py-1">{company?.name || '-'}</div>
          <div className="px-2 py-1">{voucher.cost_center || '-'}</div>
          <div className="px-2 py-1">{voucher.contact_phone || company?.phone || '-'}</div>
        </div>

        <div className="mt-4 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">Servicos inclusos e valores previstos</div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-blue-50 text-left font-black">
              <th className="px-2 py-1">Servico</th>
              <th className="px-2 py-1">Detalhe</th>
              <th className="px-2 py-1 text-right">Qtd.</th>
              <th className="px-2 py-1 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Hospedagem', `${voucher.category || '-'} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`, `${nights} diaria(s)`, clientMoney(totals.tariff * nights)],
              ...(totals.iss > 0 ? [['ISS', 'Imposto sobre servico', '1', clientMoney(totals.iss)]] : []),
              ...(totals.service > 0 ? [['Taxa', 'Taxa de servico', '1', clientMoney(totals.service)]] : []),
              ['Total previsto', 'Sujeito a validacao operacional', '', clientMoney(Number(voucher.total_amount || totals.total))],
            ].map((row, index) => (
              <tr key={index} className="border-b border-neutral-100">
                <td className="px-2 py-1.5 font-bold">{row[0]}</td>
                <td className="px-2 py-1.5">{row[1]}</td>
                <td className="px-2 py-1.5 text-right">{row[2]}</td>
                <td className="px-2 py-1.5 text-right font-bold">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">Informacoes para faturamento</div>
        <div className="grid grid-cols-2 gap-6 px-2 py-2 text-xs leading-5">
          <div>
            <p className="font-black uppercase">Dados fiscais / nota</p>
            <p className="mt-1 whitespace-pre-line">{voucher.billing_info || 'Utilizar dados cadastrais da empresa/agencia.'}</p>
          </div>
          <div>
            <p className="font-black uppercase">Instrucoes adicionais</p>
            <p className="mt-1 whitespace-pre-line">{voucher.billing_obs || 'Sem observacoes adicionais.'}</p>
          </div>
        </div>

        <footer className="mt-10">
          <div className="border-y border-dashed border-neutral-300 py-2 text-xs font-black uppercase tracking-widest text-neutral-500">Protocolo de entrega do voucher</div>
          <div className="mt-2 grid grid-cols-[1fr_1fr] gap-8 bg-blue-50 p-3 text-xs">
            <div>
              <p><strong>Codigo:</strong> {code}</p>
              <p><strong>Hospede:</strong> {paxNames[0] || voucher.guest_name}</p>
              <p><strong>Entrada:</strong> {clientDate(voucher.check_in)}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-2">
              <div className="border-t border-neutral-700 pt-1 text-center">DATA</div>
              <div className="border-t border-neutral-700 pt-1 text-center">NOME</div>
              <div className="border-t border-neutral-700 pt-1 text-center">DOCUMENTO</div>
              <div className="border-t border-neutral-700 pt-1 text-center">ASSINATURA</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

const clientMoney = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clientDate = (value?: string) => value ? new Date(value + (value.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('pt-BR') : '-';

function calculateReservationTotal(value: { tariff: number; iss_enabled?: boolean; iss_tax?: number; service_enabled?: boolean; service_tax?: number }) {
  const tariff = Number(value.tariff || 0);
  const iss = value.iss_enabled ? tariff * (Number(value.iss_tax || 0) / 100) : 0;
  const service = value.service_enabled ? tariff * (Number(value.service_tax || 0) / 100) : 0;
  return { tariff, iss, service, total: tariff + iss + service };
}

const reservationStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Em hospedagem',
  CHECKED_OUT: 'A faturar',
  CANCELLED: 'Cancelada',
  REQUESTED: 'Em analise',
  APPROVED: 'Aprovada',
  REJECTED: 'Negada',
};

const paymentMethodLabel: Record<string, string> = {
  BILLED: 'Faturado',
  VIRTUAL_CARD: 'Cartao virtual',
};

const CATEGORY_TO_TARIFF_CATEGORY: Record<string, Tariff['category']> = {
  executivo: 'executivo',
  superior: 'superior',
  premium: 'superior',
  master: 'master',
  luxo: 'master',
  suite: 'suite presidencial',
  'suite presidencial': 'suite presidencial',
};

const OCCUPANCY_TO_ROOM_TYPE: Record<string, Tariff['room_type']> = {
  SGL: 'single',
  DBL: 'duplo',
  TPL: 'triplo',
  QDL: 'quadruplo',
};

const getTariffDailyTotal = (tariff: Tariff) => Number(tariff.base_rate || 0) * (1 + Number(tariff.percentage || 0) / 100);

type ClientBlockedDate = {
  id?: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  category?: string | null;
};

const dateOnly = (date: Date) => format(date, 'yyyy-MM-dd');
const localDate = (value: string) => new Date(`${value}T12:00:00`);
const todayISO = () => dateOnly(new Date());

const getStayDates = (checkIn?: string, checkOut?: string) => {
  if (!checkIn || !checkOut) return [];
  const start = localDate(checkIn);
  const end = localDate(checkOut);
  if (end <= start) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(dateOnly(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const normalizeReservationCategory = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const GLOBAL_BLOCK_CATEGORIES = new Set(['all', 'todos', 'todas', 'geral', 'todas as categorias', 'todas categorias']);

const categoryMatchesBlock = (blockCategory: string | null | undefined, selectedCategory: string) => {
  if (!blockCategory) return true;
  const normalizedBlock = normalizeReservationCategory(blockCategory);
  if (GLOBAL_BLOCK_CATEGORIES.has(normalizedBlock)) return true;
  const normalizedSelected = normalizeReservationCategory(selectedCategory);
  const selectedTariffCategory = normalizeReservationCategory(CATEGORY_TO_TARIFF_CATEGORY[normalizedSelected] || normalizedSelected);
  const blockTariffCategory = normalizeReservationCategory(CATEGORY_TO_TARIFF_CATEGORY[normalizedBlock] || normalizedBlock);
  return normalizedBlock === normalizedSelected || blockTariffCategory === selectedTariffCategory;
};

const findBlockedDate = (date: string, category: string, blockedDates: ClientBlockedDate[]) => {
  return blockedDates.find(block =>
    categoryMatchesBlock(block.category, category) &&
    date >= block.start_date &&
    date <= block.end_date
  );
};

const findBlockedRange = (checkIn: string, checkOut: string, category: string, blockedDates: ClientBlockedDate[]) => {
  return blockedDates.find(block =>
    categoryMatchesBlock(block.category, category) &&
    checkIn <= block.end_date &&
    checkOut >= block.start_date
  );
};

export default function ClientDashboard({ profile, initialTab = 'active' }: { profile: UserProfile, initialTab?: 'active' | 'trash' | 'reservations' }) {
  const isExternalClient = profile.role === 'external_client';
  const canManageClientArchive = !!profile.permissions?.canUploadFiles && !isExternalClient;
  const [company, setCompany] = useState<Company | null>(null);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [previewFile, setPreviewFile] = useState<FiscalFile | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [viewingDispute, setViewingDispute] = useState<FiscalFile | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'trash' | 'reservations'>(initialTab);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationRequests, setReservationRequests] = useState<ReservationRequest[]>([]);
  const [billingProfiles, setBillingProfiles] = useState<CompanyBillingProfile[]>([]);
  const [corporateTariffs, setCorporateTariffs] = useState<Tariff[]>([]);
  const [blockedDates, setBlockedDates] = useState<ClientBlockedDate[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [hotelProfile, setHotelProfile] = useState<VoucherHotelProfile>(DEFAULT_VOUCHER_HOTEL_PROFILE);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [submittingReservation, setSubmittingReservation] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<Reservation | ReservationRequest | null>(null);
  const [cancelRequest, setCancelRequest] = useState<{ item: Reservation | ReservationRequest; reason: string } | null>(null);
  const [sendingCancelRequest, setSendingCancelRequest] = useState(false);

  // Reservation form state
  const [reservationForm, setReservationForm] = useState({
    guest_name: '',
    pax_names: [''],
    check_in: '',
    check_out: '',
    cost_center: '',
    billing_obs: '',
    tariff: 0,
    category: 'executivo',
    guests_per_uh: 1,
    contact_phone: '',
    iss_enabled: false,
    iss_tax: 5,
    service_enabled: false,
    service_tax: 10,
    occupancy_type: 'SGL' as 'SGL' | 'DBL' | 'TPL' | 'QDL',
    billing_profile_id: '',
    payment_method: 'BILLED' as 'BILLED' | 'VIRTUAL_CARD',
    requested_by: profile.name || '',
    billing_info: ''
  });

  const generateReservationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RYL-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const setPaxName = (index: number, value: string) => {
    setReservationForm(prev => {
      const pax = [...prev.pax_names];
      pax[index] = value;
      return { ...prev, pax_names: pax, guest_name: index === 0 ? value : prev.guest_name };
    });
  };

  const addPaxName = () => {
    setReservationForm(prev => ({ ...prev, pax_names: [...prev.pax_names, ''] }));
  };

  const removePaxName = (index: number) => {
    setReservationForm(prev => {
      const pax = prev.pax_names.filter((_, idx) => idx !== index);
      const nextPax = pax.length > 0 ? pax : [''];
      return { ...prev, pax_names: nextPax, guest_name: nextPax[0] || '' };
    });
  };

  const applyBillingProfile = (profileId: string) => {
    const selected = billingProfiles.find(item => item.id === profileId);
    if (!selected) {
      setReservationForm(prev => ({ ...prev, billing_profile_id: profileId }));
      return;
    }

    const billingInfo = [
      selected.legal_name ? `Razao social: ${selected.legal_name}` : '',
      selected.cnpj ? `CNPJ: ${selected.cnpj}` : '',
      selected.fiscal_address ? `Endereco fiscal: ${selected.fiscal_address}` : '',
      selected.fiscal_email ? `E-mail fiscal: ${selected.fiscal_email}` : '',
    ].filter(Boolean).join('\n');

    setReservationForm(prev => ({
      ...prev,
      billing_profile_id: profileId,
      cost_center: selected.cost_center || prev.cost_center,
      billing_obs: selected.billing_instructions || prev.billing_obs,
      billing_info: billingInfo || prev.billing_info,
    }));
  };

  const findCorporateTariff = (categoryValue = reservationForm.category, occupancyValue = reservationForm.occupancy_type) => {
    const tariffCategory = CATEGORY_TO_TARIFF_CATEGORY[categoryValue] || categoryValue;
    const roomType = OCCUPANCY_TO_ROOM_TYPE[occupancyValue] || 'single';
    return corporateTariffs.find(item => item.category === tariffCategory && item.room_type === roomType) || null;
  };

  const selectedCorporateTariff = findCorporateTariff();
  const selectedStayDates = getStayDates(reservationForm.check_in, reservationForm.check_out);
  const reservationPreviewTotals = calculateReservationTotal(reservationForm);
  const reservationPreviewNights = Math.max(1, selectedStayDates.length || 1);
  const reservationPreviewPax = reservationForm.pax_names.map(name => name.trim()).filter(Boolean);
  const reservationDraftVoucher: ReservationRequest = {
    guest_name: reservationPreviewPax[0] || reservationForm.guest_name || 'Hospede',
    pax_names: reservationPreviewPax.length > 0 ? reservationPreviewPax : [reservationForm.guest_name || 'Hospede'],
    check_in: reservationForm.check_in || todayISO(),
    check_out: reservationForm.check_out || format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    company_id: profile.company_id || '',
    total_amount: reservationPreviewTotals.total,
    created_at: new Date().toISOString(),
    reservation_code: 'PREVIEW',
    cost_center: reservationForm.cost_center,
    billing_obs: reservationForm.billing_obs,
    tariff: Number(reservationForm.tariff || 0),
    category: reservationForm.category,
    guests_per_uh: reservationForm.guests_per_uh,
    contact_phone: reservationForm.contact_phone,
    iss_tax: reservationForm.iss_enabled ? reservationForm.iss_tax : 0,
    service_tax: reservationForm.service_enabled ? reservationForm.service_tax : 0,
    payment_method: reservationForm.payment_method,
    billing_info: reservationForm.billing_info,
    requested_by: reservationForm.requested_by,
    occupancy_type: reservationForm.occupancy_type,
    billing_profile_id: reservationForm.billing_profile_id || undefined,
    status: 'REQUESTED',
  };
  const selectedRangeBlock = reservationForm.check_in && reservationForm.check_out
    ? findBlockedRange(reservationForm.check_in, reservationForm.check_out, reservationForm.category, blockedDates)
    : undefined;
  const selectedRangeUnavailable = reservationForm.check_in && reservationForm.check_out && (
    localDate(reservationForm.check_out) <= localDate(reservationForm.check_in) ||
    Boolean(selectedRangeBlock)
  );

  const calendarStart = (() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return start;
  })();
  const reservationCalendarDays = Array.from({ length: 42 }, (_, index) => {
    const current = new Date(calendarStart);
    current.setDate(calendarStart.getDate() + index);
    const iso = dateOnly(current);
    const block = findBlockedDate(iso, reservationForm.category, blockedDates);
    const isPast = iso < todayISO();
    const inStay = selectedStayDates.includes(iso);
    return {
      date: current,
      iso,
      block,
      isPast,
      inMonth: current.getMonth() === calendarMonth.getMonth(),
      inStay,
      isCheckIn: reservationForm.check_in === iso,
      isCheckOut: reservationForm.check_out === iso,
      available: !isPast && !block,
    };
  });

  const validateReservationRange = (checkIn: string, checkOut: string, category = reservationForm.category) => {
    if (!checkIn || !checkOut) return { available: true, message: '' };
    if (localDate(checkOut) <= localDate(checkIn)) {
      return { available: false, message: 'O check-out precisa ser posterior ao check-in.' };
    }
    const blocked = findBlockedRange(checkIn, checkOut, category, blockedDates);
    if (blocked) {
      return {
        available: false,
        message: blocked.reason
          ? `Periodo indisponivel: ${blocked.reason}`
          : `Periodo indisponivel entre ${clientDate(blocked.start_date)} e ${clientDate(blocked.end_date)}.`,
      };
    }
    return { available: true, message: '' };
  };

  const validateLiveReservationAvailability = async () => {
    const basic = validateReservationRange(reservationForm.check_in, reservationForm.check_out);
    if (!basic.available) return basic;

    const { data, error } = await supabase
      .from('booking_blocked_dates')
      .select('id,start_date,end_date,reason,category')
      .eq('active', true)
      .lte('start_date', reservationForm.check_out)
      .gte('end_date', reservationForm.check_in);

    if (error) {
      console.error('ClientDashboard: live blocked date validation failed:', error);
      return {
        available: false,
        message: 'Nao foi possivel validar a disponibilidade agora. Tente novamente em instantes.',
      };
    }

    const liveBlocks = (data || []) as ClientBlockedDate[];
    setBlockedDates(prev => {
      const byId = new Map<string, ClientBlockedDate>();
      [...prev, ...liveBlocks].forEach(block => {
        byId.set(block.id || `${block.start_date}-${block.end_date}-${block.category || 'all'}`, block);
      });
      return Array.from(byId.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
    });

    const blocked = findBlockedRange(reservationForm.check_in, reservationForm.check_out, reservationForm.category, liveBlocks);
    if (blocked) {
      return {
        available: false,
        message: blocked.reason
          ? `Periodo indisponivel: ${blocked.reason}`
          : `Periodo indisponivel entre ${clientDate(blocked.start_date)} e ${clientDate(blocked.end_date)}.`,
      };
    }

    return { available: true, message: '' };
  };

  const handleCalendarDayClick = (iso: string) => {
    const blocked = findBlockedDate(iso, reservationForm.category, blockedDates);
    if (iso < todayISO()) {
      toast.error('Escolha uma data futura.');
      return;
    }
    if (blocked) {
      toast.error(`Data indisponivel${blocked.reason ? `: ${blocked.reason}` : '.'}`);
      return;
    }

    if (!reservationForm.check_in || (reservationForm.check_in && reservationForm.check_out) || iso <= reservationForm.check_in) {
      setReservationForm(prev => ({ ...prev, check_in: iso, check_out: '' }));
      return;
    }

    const range = validateReservationRange(reservationForm.check_in, iso);
    if (!range.available) {
      toast.error(range.message);
      return;
    }
    setReservationForm(prev => ({ ...prev, check_out: iso }));
  };

  // Filter states
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterPeriodStart, setFilterPeriodStart] = useState<string>('');
  const [filterPeriodEnd, setFilterPeriodEnd] = useState<string>('');

  useEffect(() => {
    if (!selectedCorporateTariff) return;
    const agreedRate = Number(getTariffDailyTotal(selectedCorporateTariff).toFixed(2));
    setReservationForm(prev => (
      Number(prev.tariff || 0) === agreedRate ? prev : { ...prev, tariff: agreedRate }
    ));
  }, [selectedCorporateTariff?.id, selectedCorporateTariff?.base_rate, selectedCorporateTariff?.percentage]);

  useEffect(() => {
    if (!canManageClientArchive && activeTab === 'trash') {
      setActiveTab(isExternalClient ? 'reservations' : 'active');
    }
  }, [isExternalClient, canManageClientArchive, activeTab]);

  useEffect(() => {
    if (profile.company_id) {
      fetchData();
      fetchReservations();
      
      // Fetch initial notifications
      const fetchNotifications = async () => {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('timestamp', { ascending: false })
          .limit(10);

        if (data) {
          setNotifications(data.map(n => ({
            id: n.id,
            user_id: n.user_id,
            title: n.title,
            message: n.message,
            timestamp: n.timestamp,
            read: n.read,
            link: n.link
          } as Notification)));
        }
      };

      fetchNotifications();

      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${profile.id}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [profile.company_id, profile.id]);

  const fetchData = async () => {
    console.log("ClientDashboard: fetchData started for company_id:", profile.company_id);
    setLoading(true);
    try {
      // Fetch Company Info
      console.log("ClientDashboard: Fetching company info...");
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id!)
        .single();
      
      if (companyError) {
        console.error("ClientDashboard: Error fetching company:", companyError);
      }

      if (companyData) {
        console.log("ClientDashboard: Company data fetched:", companyData.name);
        setCompany({
          id: companyData.id,
          name: companyData.name,
          cnpj: companyData.cnpj,
          email: companyData.email,
          phone: companyData.phone,
          address: companyData.address,
          status: companyData.status,
          slug: companyData.slug,
          created_at: companyData.created_at
        } as Company);
      }

      // Fetch Files
      console.log("ClientDashboard: Fetching files...");
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (filesError) {
        console.error("ClientDashboard: Error fetching files:", filesError);
      }

      if (filesData) {
        console.log("ClientDashboard: Files fetched:", filesData.length);
        const filesList = await Promise.all(filesData.map(async (f) => {
          const fileObj: FiscalFile = {
            id: f.id,
            company_id: f.company_id,
            original_name: f.original_name,
            storage_path: f.storage_path,
            type: f.type,
            period: f.period,
            upload_date: f.created_at,
            uploader_id: f.uploader_id,
            amount: f.amount,
            due_date: f.due_date,
            status: f.status,
            viewed_by_client: f.viewed_by_client,
            viewed_at: f.viewed_at,
            is_deleted: f.is_deleted,
            deleted_at: f.deleted_at,
            deleted_by: f.deleted_by,
            proof_url: f.proof_url,
            proof_date: f.proof_date,
            dispute_reason: f.dispute_reason,
            dispute_images: f.dispute_images,
            dispute_at: f.dispute_at,
            tracking_stage: f.tracking_stage,
            tracking_status: f.tracking_status,
            tracking_notes: f.tracking_notes
          };

          try {
            const { data } = supabase.storage.from('files').getPublicUrl(f.storage_path);
            const publicUrl = data?.publicUrl || '';
            return { ...fileObj, download_url: publicUrl };
          } catch (e) {
            console.error("ClientDashboard: Error getting public URL for file:", f.id, e);
            return fileObj;
          }
        }));
        setFiles(filesList);
      }

      const { data: profileData, error: profileError } = await supabase
        .from('company_billing_profiles')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('active', true)
        .order('name');
      if (!profileError && profileData) setBillingProfiles(profileData as CompanyBillingProfile[]);

      const { data: tariffData, error: tariffError } = await supabase
        .from('tariffs')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('category')
        .order('room_type');
      if (tariffError) {
        console.error("ClientDashboard: Error fetching corporate tariffs:", tariffError);
        setCorporateTariffs([]);
      } else if (tariffData) {
        setCorporateTariffs(tariffData as Tariff[]);
      }

      const { data: blockedData, error: blockedError } = await supabase
        .from('booking_blocked_dates')
        .select('start_date,end_date,reason,category')
        .eq('active', true)
        .order('start_date', { ascending: true });
      if (blockedError) {
        console.error("ClientDashboard: Error fetching blocked dates:", blockedError);
        setBlockedDates([]);
      } else {
        setBlockedDates((blockedData || []) as ClientBlockedDate[]);
      }

      const { data: hotelSetting, error: hotelError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'voucher_hotel_profile')
        .maybeSingle();
      if (!hotelError && hotelSetting?.value) {
        const value = typeof hotelSetting.value === 'string' ? JSON.parse(hotelSetting.value) : hotelSetting.value;
        setHotelProfile({ ...DEFAULT_VOUCHER_HOTEL_PROFILE, ...value });
      }
      console.log("ClientDashboard: fetchData completed successfully");
    } catch (error) {
      console.error("ClientDashboard: Error in fetchData:", error);
    } finally {
      // Don't set loading false here because fetchReservations also runs
    }
  };

  const fetchReservations = async () => {
    try {
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (resError) console.warn("Table 'reservations' might not exist or schema mismatch.");
      if (resData) setReservations(resData as Reservation[]);

      const { data: reqData, error: reqError } = await supabase
        .from('reservation_requests')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (reqError) console.warn("Table 'reservation_requests' might not exist or schema mismatch.");
      if (reqData) setReservationRequests(reqData as ReservationRequest[]);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReservation(true);

    try {
      const resCode = generateReservationCode();
      const paxNames = reservationForm.pax_names.map(name => name.trim()).filter(Boolean);
      const requesterName = reservationForm.requested_by.trim();
      if (paxNames.length === 0) {
        toast.error('Informe pelo menos um PAX.');
        return;
      }
      if (!requesterName) {
        toast.error('Informe o solicitante da reserva.');
        return;
      }
      if (!reservationForm.check_in || !reservationForm.check_out) {
        toast.error('Selecione entrada e saida pelo calendario de disponibilidade.');
        return;
      }
      const availability = await validateLiveReservationAvailability();
      if (!availability.available) {
        toast.error(availability.message);
        return;
      }
      const agreementTariff = findCorporateTariff();
      if (corporateTariffs.length > 0 && !agreementTariff) {
        toast.error('Nao ha tarifa acordo vinculada para esta categoria/ocupacao. Fale com Reservas para ajustar o tarifario.');
        return;
      }
      const tariffValue = agreementTariff
        ? Number(getTariffDailyTotal(agreementTariff).toFixed(2))
        : Number(reservationForm.tariff || 0);
      const requestForm = { ...reservationForm, tariff: tariffValue };
      const reservationTotals = calculateReservationTotal(requestForm);
      const { iss_enabled, service_enabled, pax_names: _formPax, ...reservationValues } = reservationForm;
      const newRequest: ReservationRequest = {
        ...reservationValues,
        tariff: tariffValue,
        guest_name: paxNames[0],
        pax_names: paxNames,
        iss_tax: reservationForm.iss_enabled ? reservationForm.iss_tax : 0,
        service_tax: reservationForm.service_enabled ? reservationForm.service_tax : 0,
        occupancy_type: reservationForm.occupancy_type,
        billing_profile_id: reservationForm.billing_profile_id || undefined,
        company_id: profile.company_id!,
        reservation_code: resCode,
        requested_by: requesterName,
        created_at: new Date().toISOString(),
        status: 'REQUESTED',
        total_amount: reservationTotals.total
      };

      const { error } = await supabase
        .from('reservation_requests')
        .insert([newRequest]);

      if (error) throw error;

      toast.success('Solicitação de reserva enviada!');
      setShowReservationForm(false);
      setViewingVoucher(newRequest);
      fetchReservations();
      
      // Notify admin, reservations and reception roles
      const { data: staffToNotify } = await supabase.from('profiles').select('id, role');
      const notifyRoles = ['admin', 'reservations', 'reception'];
      const recipients = (staffToNotify || []).filter((u: any) => notifyRoles.includes(u.role));
      for (const recipient of recipients) {
        await sendNotification({
          user_id: recipient.id,
          title: 'Nova Solicitação de Reserva',
          message: `Cliente ${requesterName} (${company?.name || 'sem empresa'}) solicitou reserva (Ref: ${resCode}).`,
          link: '/dashboard'
        });
      }
    } catch (error) {
      console.error("Error requesting reservation:", error);
      const message = error instanceof Error ? error.message : String(error || '');
      toast.error(message.includes('Periodo bloqueado') ? message : 'Erro ao enviar solicitação.');
    } finally {
      setSubmittingReservation(false);
    }
  };

  const handlePrepareExtension = (existingRes: Reservation | ReservationRequest) => {
    // Fill the form with existing data but set new dates
    const checkOut = new Date(existingRes.check_out + 'T12:00:00');
    const newCheckIn = format(checkOut, 'yyyy-MM-dd');
    const newCheckOut = format(addDays(checkOut, 1), 'yyyy-MM-dd');

    setReservationForm({
      guest_name: existingRes.guest_name,
      pax_names: getReservationPaxNames(existingRes),
      check_in: newCheckIn,
      check_out: newCheckOut,
      cost_center: existingRes.cost_center || '',
      tariff: existingRes.tariff || 0,
      category: existingRes.category || 'executivo',
      guests_per_uh: existingRes.guests_per_uh || 1,
      contact_phone: existingRes.contact_phone || '',
      iss_enabled: Number(existingRes.iss_tax || 0) > 0,
      iss_tax: existingRes.iss_tax || 5,
      service_enabled: Number(existingRes.service_tax || 0) > 0,
      service_tax: existingRes.service_tax || 10,
      occupancy_type: existingRes.occupancy_type || deriveOccupancyType(existingRes.guests_per_uh),
      billing_profile_id: existingRes.billing_profile_id || '',
      payment_method: existingRes.payment_method || 'BILLED',
      requested_by: existingRes.requested_by || profile.name || '',
      billing_obs: existingRes.billing_obs || '',
      billing_info: existingRes.billing_info || ''
    });
    
    setShowReservationForm(true);
    toast.info('Formulário preenchido para prorrogação do hóspede ' + existingRes.guest_name);
  };

  const handleRequestCancellation = async () => {
    if (!cancelRequest) return;
    setSendingCancelRequest(true);

    const item = cancelRequest.item;
    const reason = cancelRequest.reason.trim() || 'Cliente solicitou cancelamento sem detalhar motivo.';
    const isConfirmedReservation = 'id' in item && reservations.some(res => res.id === item.id);

    try {
      const { data: staffToNotify } = await supabase.from('profiles').select('id, role');
      const notifyRoles = ['admin', 'reservations', 'reception'];
      const recipients = (staffToNotify || []).filter((u: any) => notifyRoles.includes(u.role));

      for (const recipient of recipients) {
        await sendNotification({
          user_id: recipient.id,
          title: 'Solicitacao de cancelamento de reserva',
          message: `Cliente ${profile.name} (${company?.name || 'sem empresa'}) solicitou cancelamento da reserva ${item.reservation_code} - ${item.guest_name}. Motivo: ${reason}`,
          link: '/dashboard'
        });
      }

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Solicitacao de cancelamento pelo cliente',
        details: `Reserva: ${item.reservation_code}; Hospede: ${item.guest_name}; Tipo: ${isConfirmedReservation ? 'reserva confirmada' : 'solicitacao'}; Motivo: ${reason}`,
        type: 'update'
      });

      toast.success('Solicitacao de cancelamento enviada para a equipe de reservas.');
      setCancelRequest(null);
    } catch (error) {
      console.error('Error requesting cancellation:', error);
      toast.error('Nao foi possivel enviar o pedido de cancelamento.');
    } finally {
      setSendingCancelRequest(false);
    }
  };

  const filteredFiles = files.filter(file => {
    if (activeTab === 'trash') return file.is_deleted;
    if (file.is_deleted) return false;
    const typeMatch = filterType === 'ALL' || file.type === filterType;
    const isFinancial = FINANCIAL_TYPES.includes(file.type);
    const filePeriod = isFinancial && file.due_date ? file.due_date.substring(0, 7) : file.period;
    const periodStartMatch = !filterPeriodStart || (filePeriod && filePeriod >= filterPeriodStart);
    const periodEndMatch = !filterPeriodEnd || (filePeriod && filePeriod <= filterPeriodEnd);
    return typeMatch && periodStartMatch && periodEndMatch;
  });

  const activeReservations = reservations.filter(r => !['CANCELLED', 'CHECKED_OUT'].includes(r.status));
  const checkedOutReservations = reservations.filter(r => r.status === 'CHECKED_OUT');
  const pendingRequests = reservationRequests.filter(r => r.status === 'REQUESTED');
  const rejectedRequests = reservationRequests.filter(r => r.status === 'REJECTED');
  const checkedOutTotal = checkedOutReservations.reduce((sum, res) => sum + Number(res.total_amount || 0), 0);
  const activeFiles = files.filter(file => !file.is_deleted);
  const openInvoices = activeFiles.filter(file => FINANCIAL_TYPES.includes(file.type) && file.status !== 'PAID' && file.status !== 'CANCELLED');
  const overdueInvoices = openInvoices.filter(file => file.due_date && new Date(file.due_date + 'T12:00:00') < new Date(new Date().toDateString()));
  const openDebtTotal = openInvoices.reduce((sum, file) => sum + Number(file.amount || 0), 0);

  const markAsViewed = async (file: FiscalFile) => {
    if (!file.viewed_by_client) {
      try {
        const viewedAt = new Date().toISOString();
        await supabase
          .from('files')
          .update({
            viewed_by_client: true,
            viewed_at: viewedAt
          })
          .eq('id', file.id);
        
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, viewed_by_client: true, viewed_at: viewedAt } : f));
      } catch (error) {
        console.error("Error marking file as viewed:", error);
      }
    }
  };

  const handleDownload = async (file: FiscalFile) => {
    await markAsViewed(file);
    toast.success('Iniciando download...');
    logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Download de Arquivo',
      details: `Arquivo: ${file.original_name}`,
      type: 'download'
    });
  };

  const handleMoveToTrash = async (fileId: string, originalName: string) => {
    if (!window.confirm(`Deseja mover o arquivo "${originalName}" para a lixeira?`)) return;
    try {
      const deletedAt = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          is_deleted: true,
          deleted_at: deletedAt,
          deleted_by: profile.name
        })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { 
        ...f, 
        is_deleted: true, 
        deleted_at: deletedAt, 
        deleted_by: profile.name 
      } : f));
      
      toast.success('Arquivo movido para a lixeira!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Mover para Lixeira (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'delete'
      });
    } catch (error) {
      console.error("Error moving to trash:", error);
      toast.error('Erro ao mover para a lixeira.');
    }
  };

  const handleRecoverFile = async (fileId: string, originalName: string) => {
    try {
      await supabase
        .from('files')
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by: null
        })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { 
        ...f, 
        is_deleted: false, 
        deleted_at: undefined, 
        deleted_by: undefined 
      } : f));
      
      toast.success('Arquivo recuperado com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Recuperar Arquivo (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error recovering file:", error);
      toast.error('Erro ao recuperar arquivo.');
    }
  };

  const handlePermanentDeleteFile = async (fileId: string, originalName: string) => {
    if (!window.confirm(`AVISO: Deseja excluir PERMANENTEMENTE o arquivo "${originalName}"? Esta ação não pode ser desfeita.`)) return;
    try {
      // Delete from storage first
      const file = files.find(f => f.id === fileId);
      if (file?.storage_path) {
        await supabase.storage.from('files').remove([file.storage_path]);
      }

      await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('Arquivo excluído permanentemente!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Exclusão Permanente (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'delete'
      });
    } catch (error) {
      console.error("Error permanently deleting file:", error);
      toast.error('Erro ao excluir arquivo permanentemente.');
    }
  };

  const handlePreview = async (file: FiscalFile) => {
    await markAsViewed(file);
    setPreviewFile(file);
    logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Visualização de Arquivo',
      details: `Arquivo: ${file.original_name}`,
      type: 'download'
    });
  };

  const markNotificationRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
    } catch (error) {
      console.error("Error marking notification read:", error);
    }
  };

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFileId) return;

    setUploadingProof(true);
    try {
      const storagePath = `proofs/${selectedFileId}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('files')
        .getPublicUrl(storagePath);

      const proofDate = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          proof_url: publicUrl,
          proof_date: proofDate
        })
        .eq('id', selectedFileId);

      setFiles(prev => prev.map(f => f.id === selectedFileId ? { ...f, proof_url: publicUrl, proof_date: proofDate } : f));
      toast.success('Comprovante enviado com sucesso!');
      setProofModalOpen(false);
      setSelectedFileId(null);
      
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Envio de Comprovante',
        details: `Arquivo ID: ${selectedFileId}`,
        type: 'upload'
      });
    } catch (error) {
      console.error("Error uploading proof:", error);
      toast.error('Erro ao enviar comprovante.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSendDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileId || !disputeReason) return;

    setUploadingProof(true);
    try {
      const imageUrls: string[] = [];
      
      for (const file of disputeFiles) {
        const storagePath = `disputes/${selectedFileId}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(storagePath, file);
        
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('files')
          .getPublicUrl(storagePath);
        
        imageUrls.push(publicUrl);
      }

      const disputeAt = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          dispute_reason: disputeReason,
          dispute_images: imageUrls,
          dispute_at: disputeAt
        })
        .eq('id', selectedFileId);

      setFiles(prev => prev.map(f => f.id === selectedFileId ? { 
        ...f, 
        dispute_reason: disputeReason, 
        dispute_images: imageUrls, 
        dispute_at: disputeAt 
      } : f));

      toast.success('Contestação enviada com sucesso!');
      setDisputeModalOpen(false);
      setSelectedFileId(null);
      setDisputeReason('');
      setDisputeFiles([]);

      // Notify Admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        for (const admin of admins) {
          await sendNotification({
            user_id: admin.id,
            title: 'Nova Contestação',
            message: `O cliente ${profile.name} da empresa ${company?.name} contestou o arquivo ${files.find(f => f.id === selectedFileId)?.original_name}. Motivo: ${disputeReason.substring(0, 50)}...`,
            link: '/admin'
          });
        }
      }

      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Contestação de Fatura',
        details: `Arquivo ID: ${selectedFileId}, Motivo: ${disputeReason}`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error sending dispute:", error);
      toast.error('Erro ao enviar contestação.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleDownloadVoucherPdf = () => {
    if (!viewingVoucher) return;
    const totals = calculateReservationTotal({
      tariff: Number(viewingVoucher.tariff || 0),
      iss_enabled: Number(viewingVoucher.iss_tax || 0) > 0,
      iss_tax: Number(viewingVoucher.iss_tax || 0),
      service_enabled: Number(viewingVoucher.service_tax || 0) > 0,
      service_tax: Number(viewingVoucher.service_tax || 0),
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    const right = 198;
    const status = (viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'EM ANÁLISE' : 'CONFIRMADA';
    const code = viewingVoucher.reservation_code || 'PENDENTE';
    const paxNames = getReservationPaxNames(viewingVoucher);
    const occupancy = viewingVoucher.occupancy_type || deriveOccupancyType(viewingVoucher.guests_per_uh);
    const requestDate = (viewingVoucher as ReservationRequest).created_at || (viewingVoucher as Reservation).created_at;
    const hotelName = hotelProfile.trade_name || hotelProfile.legal_name || 'Royal Macae';
    const hotelAddress = hotelProfile.address || 'Endereco nao informado';
    const hotelContacts = [hotelProfile.cnpj ? `CNPJ ${hotelProfile.cnpj}` : '', hotelProfile.phone, hotelProfile.email].filter(Boolean).join(' - ');
    const fiscalInfo = viewingVoucher.billing_info || 'Utilizar dados cadastrais da empresa/agencia.';
    const billingInstructions = viewingVoucher.billing_obs || 'Sem observacoes adicionais.';

    pdf.setTextColor(17, 24, 39);
    pdf.setDrawColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(hotelName.toUpperCase(), margin, 20, { maxWidth: 36 });
    pdf.setFontSize(6);
    pdf.text((hotelProfile.legal_name || 'HOTEL').toUpperCase(), margin, 26, { maxWidth: 36 });
    pdf.setFontSize(8);
    pdf.text('PORTAL CORPORATIVO B2B', 54, 15);
    pdf.setFontSize(18);
    pdf.text('AUTORIZACAO DE HOSPEDAGEM', 54, 23);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(`${hotelName} - ${hotelAddress}`, 54, 29, { maxWidth: 118 });
    pdf.text(hotelContacts || 'Dados oficiais do hotel configuraveis pelo admin', 54, 34, { maxWidth: 118 });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('LOCALIZADOR', right, 15, { align: 'right' });
    pdf.setFontSize(14);
    pdf.text(code, right, 24, { align: 'right' });
    pdf.setFontSize(7);
    pdf.text('STATUS', right, 34, { align: 'right' });
    pdf.setFontSize(9);
    pdf.text(status, right, 39, { align: 'right' });
    pdf.line(margin, 58, right, 58);

    pdf.roundedRect(margin, 64, 112, 44, 2, 2);
    pdf.setFontSize(7);
    pdf.text('HÓSPEDE E PERÍODO', margin + 4, 72);
    pdf.setFontSize(15);
    pdf.text(String(paxNames[0] || viewingVoucher.guest_name || '-'), margin + 4, 82, { maxWidth: 104 });
    const guestRows = [
      ['ENTRADA', clientDate(viewingVoucher.check_in)],
      ['SAÍDA', clientDate(viewingVoucher.check_out)],
      ['CATEGORIA', viewingVoucher.category || '-'],
      ['OCUPACAO', OCCUPANCY_LABELS[occupancy] || occupancy],
    ];
    guestRows.forEach(([label, value], index) => {
      const x = margin + 4 + (index % 2) * 54;
      const y = 94 + Math.floor(index / 2) * 9;
      pdf.setFontSize(6);
      pdf.text(label, x, y);
      pdf.setFontSize(8);
      pdf.text(String(value), x, y + 4, { maxWidth: 48 });
    });

    pdf.roundedRect(130, 64, 68, 44, 2, 2);
    pdf.setFontSize(7);
    pdf.text('EMPRESA VINCULADA', 134, 72);
    pdf.setFontSize(12);
    pdf.text(company?.name || 'Empresa não vinculada', 134, 82, { maxWidth: 58 });
    pdf.setFontSize(7);
    pdf.text(`CNPJ: ${company?.cnpj || '-'}`, 134, 92, { maxWidth: 58 });
    pdf.text(`Centro de custo: ${viewingVoucher.cost_center || '-'}`, 134, 98, { maxWidth: 58 });
    pdf.text(`Contato: ${viewingVoucher.contact_phone || company?.phone || '-'}`, 134, 104, { maxWidth: 58 });

    const metricY = 118;
    const metricW = (right - margin - 6) / 3;
    [
      ['PAGAMENTO', viewingVoucher.payment_method === 'BILLED' ? 'Faturado' : 'Cartão virtual'],
      ['TARIFA', clientMoney(totals.tariff)],
      ['TOTAL PREVISTO', clientMoney(Number(viewingVoucher.total_amount || totals.total))],
    ].forEach(([label, value], index) => {
      const x = margin + index * (metricW + 3);
      pdf.setFillColor(index === 2 ? 17 : 245, index === 2 ? 24 : 245, index === 2 ? 39 : 245);
      pdf.roundedRect(x, metricY, metricW, 18, 2, 2, 'F');
      pdf.setTextColor(index === 2 ? 255 : 17, index === 2 ? 255 : 24, index === 2 ? 255 : 39);
      pdf.setFontSize(6);
      pdf.text(label, x + 3, metricY + 6);
      pdf.setFontSize(9);
      pdf.text(String(value), x + 3, metricY + 13, { maxWidth: metricW - 6 });
      pdf.setTextColor(17, 24, 39);
    });

    let y = 146;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('PAX AUTORIZADOS', margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(paxNames.map((name, index) => `${index + 1}. ${name}`).join('  |  ') || '-', right - margin - 6), margin + 3, y + 7);
    y += 22;
    pdf.setFont('helvetica', 'bold');
    pdf.text('DADOS DA SOLICITACAO', margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Solicitado em: ${requestDate ? clientDate(requestDate) : '-'}`, margin + 3, y + 7);
    pdf.text(`Tipo UH: ${viewingVoucher.category || '-'} | Pessoas/UH: ${viewingVoucher.guests_per_uh || '-'}`, 104, y + 7);
    y += 18;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('COMPOSIÇÃO PREVISTA', margin, y);
    pdf.text('Página 1 de 1', right, y, { align: 'right' });
    y += 5;
    pdf.setFillColor(212, 212, 212);
    pdf.rect(margin, y, right - margin, 8, 'F');
    pdf.text('Descrição', margin + 3, y + 5.5);
    pdf.text('Valor', right - 3, y + 5.5, { align: 'right' });
    y += 12;
    const rows: Array<[string, number]> = [['Tarifa acordada', totals.tariff]];
    if (totals.iss > 0) rows.push([`ISS ${viewingVoucher.iss_tax}%`, totals.iss]);
    if (totals.service > 0) rows.push([`Taxa de serviço ${viewingVoucher.service_tax}%`, totals.service]);
    rows.forEach(([label, value]) => {
      pdf.text(label, margin + 3, y);
      pdf.text(clientMoney(value), right - 3, y, { align: 'right' });
      y += 8;
    });

    const notesY = Math.max(y + 10, 188);
    pdf.roundedRect(margin, notesY, 86, 35, 2, 2);
    pdf.setFontSize(6);
    pdf.text('INSTRUÇÕES DE FATURAMENTO', margin + 3, notesY + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(String(billingInstructions), 78), margin + 3, notesY + 12);
    pdf.setFont('helvetica', 'bold');
    pdf.roundedRect(104, notesY, 94, 35, 2, 2);
    pdf.setFontSize(6);
    pdf.text('DADOS PARA EMISSÃO DE NOTA', 107, notesY + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(String(fiscalInfo), 86), 107, notesY + 12);

    pdf.setFont('helvetica', 'bold');
    pdf.line(margin, 258, margin + 86, 258);
    pdf.line(112, 258, right, 258);
    pdf.setFontSize(6);
    pdf.text(`${hotelName.toUpperCase()} - RESERVAS / RECEPCAO`, margin, 264, { maxWidth: 82 });
    pdf.text('CLIENTE CORPORATIVO', 112, 264);
    pdf.line(margin, 282, right, 282);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text([hotelProfile.website, hotelProfile.email].filter(Boolean).join(' - ') || 'Voucher corporativo de hospedagem', 105, 288, { align: 'center' });
    pdf.save(`AUTORIZACAO_HOSPEDAGEM_${code}.pdf`);
  };

  const handleDownloadHotelVoucherPdf = () => {
    if (!viewingVoucher) return;
    const totals = calculateReservationTotal({
      tariff: Number(viewingVoucher.tariff || 0),
      iss_enabled: Number(viewingVoucher.iss_tax || 0) > 0,
      iss_tax: Number(viewingVoucher.iss_tax || 0),
      service_enabled: Number(viewingVoucher.service_tax || 0) > 0,
      service_tax: Number(viewingVoucher.service_tax || 0),
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const code = viewingVoucher.reservation_code || 'PENDENTE';
    const paxNames = getReservationPaxNames(viewingVoucher);
    const occupancy = viewingVoucher.occupancy_type || deriveOccupancyType(viewingVoucher.guests_per_uh);
    const status = (viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'RESERVA EM ANALISE' : 'HOSPEDAGEM CONFIRMADA';
    const requestDate = (viewingVoucher as ReservationRequest).created_at || (viewingVoucher as Reservation).created_at;
    const hotelName = hotelProfile.trade_name || hotelProfile.legal_name || 'Royal Macae';
    const hotelLine = [hotelProfile.address, hotelProfile.phone, hotelProfile.email].filter(Boolean).join(' | ');
    const nights = Math.max(1, Math.ceil((new Date(viewingVoucher.check_out).getTime() - new Date(viewingVoucher.check_in).getTime()) / 86400000));

    pdf.setFillColor(17, 24, 39);
    pdf.rect(0, 0, 18, 297, 'F');
    pdf.setFillColor(180, 119, 38);
    pdf.rect(18, 0, 192, 8, 'F');

    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('VOUCHER OFICIAL DE RESERVA', 26, 24);
    pdf.setFontSize(24);
    pdf.text(status, 26, 35, { maxWidth: 112 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`${hotelName} - ${hotelLine || 'Dados do hotel configuraveis pelo admin'}`, 26, 45, { maxWidth: 112 });

    pdf.setFillColor(17, 24, 39);
    pdf.roundedRect(145, 18, 53, 36, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('LOCALIZADOR', 150, 27);
    pdf.setFontSize(17);
    pdf.text(code, 150, 38, { maxWidth: 43 });
    pdf.setFontSize(8);
    pdf.text((viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'Pendente de validacao' : 'Confirmada', 150, 48);

    pdf.setTextColor(17, 24, 39);
    pdf.setDrawColor(229, 231, 235);
    pdf.setFillColor(250, 250, 250);
    pdf.roundedRect(26, 66, 108, 48, 4, 4, 'FD');
    pdf.setFontSize(7);
    pdf.text('PERIODO DA ESTADIA', 31, 76);
    pdf.setFontSize(20);
    pdf.text(clientDate(viewingVoucher.check_in), 31, 90);
    pdf.text(clientDate(viewingVoucher.check_out), 91, 90);
    pdf.setFontSize(7);
    pdf.text('ENTRADA', 31, 99);
    pdf.text('SAIDA', 91, 99);
    pdf.setFillColor(17, 24, 39);
    pdf.roundedRect(68, 101, 28, 8, 4, 4, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`${nights} NOITE(S)`, 82, 106.5, { align: 'center' });

    pdf.setTextColor(17, 24, 39);
    pdf.roundedRect(140, 66, 58, 48, 4, 4);
    pdf.setFontSize(7);
    pdf.text('HOSPEDE PRINCIPAL', 145, 76);
    pdf.setFontSize(14);
    pdf.text(String(paxNames[0] || viewingVoucher.guest_name || '-'), 145, 88, { maxWidth: 48 });
    pdf.setFontSize(8);
    pdf.text(OCCUPANCY_LABELS[occupancy] || occupancy, 145, 100);
    pdf.text(`UH: ${viewingVoucher.category || '-'}`, 145, 107);

    const cardY = 126;
    const cardW = 40;
    [
      ['SOLICITADO', requestDate ? clientDate(requestDate) : '-'],
      ['PAGAMENTO', viewingVoucher.payment_method === 'BILLED' ? 'Faturado' : 'Cartao virtual'],
      ['TARIFA', clientMoney(totals.tariff)],
      ['TOTAL', clientMoney(Number(viewingVoucher.total_amount || totals.total))],
    ].forEach(([label, value], index) => {
      const x = 26 + index * 43;
      pdf.setFillColor(index === 3 ? 17 : 245, index === 3 ? 24 : 245, index === 3 ? 39 : 245);
      pdf.roundedRect(x, cardY, cardW, 18, 2, 2, 'F');
      pdf.setTextColor(index === 3 ? 255 : 17, index === 3 ? 255 : 24, index === 3 ? 255 : 39);
      pdf.setFontSize(6);
      pdf.text(label, x + 3, cardY + 6);
      pdf.setFontSize(8);
      pdf.text(String(value), x + 3, cardY + 13, { maxWidth: cardW - 6 });
    });

    let y = 162;
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('PAX AUTORIZADOS', 26, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(paxNames.map((name, index) => `${index + 1}. ${name}`).join('   |   ') || '-', 170), 29, y + 8);

    y += 28;
    pdf.setFont('helvetica', 'bold');
    pdf.text('EMPRESA E FATURAMENTO', 26, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(company?.name || 'Empresa nao vinculada', 29, y + 8, { maxWidth: 80 });
    pdf.text(`CNPJ: ${company?.cnpj || '-'}`, 29, y + 14, { maxWidth: 80 });
    pdf.text(`Centro de custo: ${viewingVoucher.cost_center || '-'}`, 110, y + 8, { maxWidth: 76 });
    pdf.text(`Contato: ${viewingVoucher.contact_phone || company?.phone || '-'}`, 110, y + 14, { maxWidth: 76 });

    y += 30;
    pdf.setDrawColor(229, 231, 235);
    pdf.roundedRect(26, y, 82, 36, 2, 2);
    pdf.roundedRect(116, y, 82, 36, 2, 2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.text('INSTRUCOES DE FATURAMENTO', 30, y + 7);
    pdf.text('DADOS PARA NOTA FISCAL', 120, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(String(viewingVoucher.billing_obs || 'Sem observacoes adicionais.'), 74), 30, y + 14);
    pdf.text(pdf.splitTextToSize(String(viewingVoucher.billing_info || 'Utilizar dados cadastrais da empresa/agencia.'), 74), 120, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.line(26, 266, 104, 266);
    pdf.line(120, 266, 198, 266);
    pdf.setFontSize(6);
    pdf.text(`${hotelName.toUpperCase()} - RESERVAS / RECEPCAO`, 26, 272, { maxWidth: 78 });
    pdf.text('CLIENTE CORPORATIVO', 120, 272);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text([hotelProfile.website, hotelProfile.email].filter(Boolean).join(' - ') || 'Voucher corporativo de hospedagem', 112, 288, { align: 'center' });
    pdf.save(`VOUCHER_RESERVA_${code}.pdf`);
  };

  const handleDownloadTravelVoucherPdf = () => {
    if (!viewingVoucher) return;
    const totals = calculateReservationTotal({
      tariff: Number(viewingVoucher.tariff || 0),
      iss_enabled: Number(viewingVoucher.iss_tax || 0) > 0,
      iss_tax: Number(viewingVoucher.iss_tax || 0),
      service_enabled: Number(viewingVoucher.service_tax || 0) > 0,
      service_tax: Number(viewingVoucher.service_tax || 0),
    });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const code = viewingVoucher.reservation_code || 'PENDENTE';
    const paxNames = getReservationPaxNames(viewingVoucher);
    const occupancy = viewingVoucher.occupancy_type || deriveOccupancyType(viewingVoucher.guests_per_uh);
    const nights = Math.max(1, Math.ceil((new Date(viewingVoucher.check_out).getTime() - new Date(viewingVoucher.check_in).getTime()) / 86400000));
    const status = (viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'Reserva em analise' : 'Reserva confirmada';
    const hotelName = hotelProfile.trade_name || hotelProfile.legal_name || 'Royal Macae';

    const section = (title: string, y: number) => {
      pdf.setFillColor(224, 242, 254);
      pdf.setDrawColor(125, 211, 252);
      pdf.rect(10, y, 190, 7, 'FD');
      pdf.setTextColor(17, 24, 39);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(title, 13, y + 5);
    };
    const label = (text: string, x: number, y: number) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(text.toUpperCase(), x, y);
    };
    const value = (text: string, x: number, y: number, maxWidth = 70) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(String(text || '-'), x, y, { maxWidth });
    };

    pdf.setTextColor(17, 24, 39);
    pdf.setDrawColor(59, 130, 246);
    pdf.line(10, 28, 200, 28);
    pdf.addImage('/logo.png', 'PNG', 10, 8, 30, 14);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(30, 64, 175);
    pdf.text('Voucher', 45, 15);
    pdf.setFontSize(10);
    pdf.text('Documentacao de Hospedagem', 45, 21);

    const bars = code.padEnd(18, '0').slice(0, 18).split('');
    let bx = 150;
    bars.forEach((char, index) => {
      const width = char.charCodeAt(0) % 2 === 0 ? 0.8 : 1.5;
      const height = char.charCodeAt(0) % 3 === 0 ? 17 : 21;
      pdf.setFillColor(17, 24, 39);
      pdf.rect(bx, 8, width, height, 'F');
      bx += width + (index % 3 === 0 ? 0.8 : 0.4);
    });
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(6);
    pdf.text(code, 174, 26, { align: 'center' });

    let y = 38;
    label('Codigo da reserva', 10, y); value(code, 70, y);
    label('Status', 10, y + 5); value(status, 70, y + 5);
    label('Empresa', 10, y + 10); value(company?.name || 'Particular', 70, y + 10);
    label('Emitido em', 10, y + 15); value(new Date().toLocaleString('pt-BR'), 70, y + 15);

    section('NOME DOS PASSAGEIROS / HOSPEDES', 62);
    y = 73;
    paxNames.forEach((name, index) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(`${index + 1}. ${name.toUpperCase()} - [ LOCALIZADOR: ${code} ]`, 13, y);
      y += 5;
    });

    section('DETALHES DA HOSPEDAGEM', y + 3);
    y += 15;
    label('Hotel', 13, y); value(hotelName, 45, y, 88);
    label('Entrada', 140, y); value(clientDate(viewingVoucher.check_in), 172, y, 24);
    label('Endereco', 13, y + 6); value(hotelProfile.address || '-', 45, y + 6, 88);
    label('Saida', 140, y + 6); value(clientDate(viewingVoucher.check_out), 172, y + 6, 24);
    label('Telefone', 13, y + 12); value(hotelProfile.phone || '-', 45, y + 12, 88);
    label('Diarias', 140, y + 12); value(String(nights), 172, y + 12, 24);
    label('Acomodacao', 13, y + 18); value(`${viewingVoucher.category || '-'} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`, 45, y + 18, 88);
    label('UH', 140, y + 18); value(String(viewingVoucher.guests_per_uh || '-'), 172, y + 18, 24);

    section('DETALHES DO RECEPTIVO / EMPRESA', y + 28);
    y += 40;
    pdf.setFillColor(224, 242, 254);
    pdf.rect(10, y, 190, 6, 'F');
    label('Empresa', 12, y + 4); label('Centro de custo', 93, y + 4); label('Telefone', 155, y + 4);
    y += 10;
    value(company?.name || '-', 12, y, 75);
    value(viewingVoucher.cost_center || '-', 93, y, 55);
    value(viewingVoucher.contact_phone || company?.phone || '-', 155, y, 40);

    section('SERVICOS INCLUSOS E VALORES PREVISTOS', y + 10);
    y += 22;
    pdf.setFillColor(224, 242, 254);
    pdf.rect(10, y, 190, 6, 'F');
    label('Servico', 12, y + 4); label('Detalhe', 68, y + 4); label('Qtd.', 145, y + 4); label('Valor', 175, y + 4);
    y += 11;
    const serviceRows: Array<[string, string, string, string]> = [
      ['Hospedagem', `${viewingVoucher.category || '-'} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`, `${nights} diaria(s)`, clientMoney(totals.tariff * nights)],
      ...(totals.iss > 0 ? [['ISS', 'Imposto sobre servico', '1', clientMoney(totals.iss)] as [string, string, string, string]] : []),
      ...(totals.service > 0 ? [['Taxa', 'Taxa de servico', '1', clientMoney(totals.service)] as [string, string, string, string]] : []),
      ['Total previsto', 'Sujeito a validacao operacional', '', clientMoney(Number(viewingVoucher.total_amount || totals.total))],
    ];
    serviceRows.forEach(([a, b, c, d]) => {
      value(a, 12, y, 52); value(b, 68, y, 72); value(c, 148, y, 18); value(d, 174, y, 24);
      y += 6;
    });

    section('INFORMACOES PARA FATURAMENTO', y + 6);
    y += 18;
    label('Dados fiscais / nota', 13, y);
    value(viewingVoucher.billing_info || 'Utilizar dados cadastrais da empresa/agencia.', 13, y + 6, 84);
    label('Instrucoes adicionais', 111, y);
    value(viewingVoucher.billing_obs || 'Sem observacoes adicionais.', 111, y + 6, 84);

    pdf.setDrawColor(160, 160, 160);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(10, 258, 200, 258);
    pdf.setLineDashPattern([], 0);
    pdf.setFillColor(224, 242, 254);
    pdf.rect(10, 264, 190, 22, 'F');
    label('Protocolo de entrega passagem / voucher', 13, 270);
    label('Cliente', 126, 270);
    value(`Codigo: ${code}`, 13, 276, 78);
    value(`Hospede: ${paxNames[0] || viewingVoucher.guest_name}`, 13, 282, 78);
    pdf.line(126, 278, 151, 278); pdf.line(165, 278, 195, 278);
    pdf.setFontSize(6);
    pdf.text('DATA', 135, 281); pdf.text('NOME', 177, 281);
    pdf.text([hotelProfile.website, hotelProfile.email].filter(Boolean).join(' - ') || 'Voucher corporativo', 105, 294, { align: 'center' });

    pdf.save(`VOUCHER_RESERVA_${code}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!profile.company_id) {
    return (
      <div className="space-y-8">
        <div className="bg-white p-6 sm:p-16 rounded-3xl border border-neutral-200 text-center space-y-6 shadow-sm">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tighter italic">Acesso Restrito</h2>
            <p className="text-neutral-500 max-w-md mx-auto mt-2 font-medium">
              Sua conta ainda não está vinculada a uma empresa/agência. Entre em contato com o administrador do Royal Macaé para liberar suas ferramentas de faturamento e reservas.
            </p>
          </div>
          <div className="pt-4">
             <a 
              href="mailto:suporte@royalmacaepms.com.br"
              className="inline-flex items-center gap-2 bg-neutral-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
             >
               Contatar Suporte
             </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-clip pb-16">
      {/* Company Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-8"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-black tracking-tight text-neutral-950 sm:text-3xl">{company?.name || 'Sua Empresa'}</h2>
              <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />
            </div>
            <p className="text-sm font-medium text-neutral-500">CNPJ: {company?.cnpj || 'N/A'}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              Canal corporativo para solicitar hospedagens, acompanhar reservas, consultar faturas e resolver pendências com o Royal Macaé.
            </p>
          </div>

          {/* Notification Bell */}
          <div className="relative shrink-0">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative rounded-full border border-neutral-200 p-3 transition-colors hover:bg-neutral-100"
            >
              <Bell className="h-5 w-5 text-neutral-600" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-neutral-200 shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
                    <h3 className="font-bold text-sm">Notificações</h3>
                    <button onClick={() => setShowNotifications(false)}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-4 border-b border-neutral-50 cursor-pointer hover:bg-neutral-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}
                      >
                        <p className="text-xs font-bold text-neutral-900 mb-1">{n.title}</p>
                        <p className="text-xs text-neutral-500">{n.message}</p>
                        <p className="text-[10px] text-neutral-400 mt-2">{new Date(n.timestamp).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="p-8 text-center text-neutral-400">
                        <BellOff className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Nenhuma notificação.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ClientPortalKpi label="Reservas ativas" value={activeReservations.length} tone="emerald" />
          <ClientPortalKpi label="Solicitações" value={pendingRequests.length} tone="amber" />
          <ClientPortalKpi label="Faturas abertas" value={openInvoices.length} tone="neutral" />
          <ClientPortalKpi label="Débito aberto" value={openDebtTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} tone={overdueInvoices.length ? 'red' : 'ink'} />
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex bg-neutral-100 p-1 rounded-xl max-w-full overflow-x-auto">
        {!isExternalClient && (
          <>
            <button
              onClick={() => setActiveTab('active')}
              className={`shrink-0 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'active' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Faturas e débitos
            </button>
            {canManageClientArchive && (
              <button
                onClick={() => setActiveTab('trash')}
                className={`shrink-0 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'trash' 
                    ? 'bg-white text-neutral-900 shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Lixeira
              </button>
            )}
          </>
        )}
        <button
          onClick={() => setActiveTab('reservations')}
          className={`shrink-0 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'reservations' 
              ? 'bg-white text-neutral-900 shadow-sm' 
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Reservas
        </button>
        {isExternalClient && (
          <button
            onClick={() => setActiveTab('active')}
            className={`shrink-0 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'active'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Faturas e débitos
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'reservations' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 sm:p-6 rounded-xl border border-neutral-200">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">Portal corporativo de reservas</h3>
              <p className="text-neutral-400 text-xs mt-2">Solicite hospedagens, acompanhe aprovacoes, veja vouchers e peça cancelamento com registro para a equipe.</p>
              <p className="text-neutral-500 text-sm">Tudo separado por etapa: em analise, ativa, a faturar/debitar e historico.</p>
            </div>
            <button 
              onClick={() => setShowReservationForm(true)}
              className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Solicitar Reserva
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ClientPortalKpi label="Em analise" value={pendingRequests.length} tone="amber" />
            <ClientPortalKpi label="Ativas" value={activeReservations.length} tone="emerald" />
            <ClientPortalKpi label="A faturar/debitar" value={checkedOutReservations.length} tone="neutral" />
            <ClientPortalKpi label="Previsto faturar" value={clientMoney(checkedOutTotal)} tone={checkedOutReservations.length ? 'ink' : 'neutral'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Reservations */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center">
                <h4 className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Reservas Confirmadas / Ativas
                </h4>
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {activeReservations.length > 0 ? activeReservations.map(res => (
                  <div key={res.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-black text-neutral-900 text-lg uppercase tracking-tight">{res.guest_name}</p>
                        <p className="text-xs text-neutral-400 font-mono tracking-widest">{res.reservation_code}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700`}>
                        {res.status === 'PENDING' ? 'CONFIRMADA' : res.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-6 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Entrada</p>
                        <p className="font-bold text-neutral-700">{new Date(res.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="space-y-1 text-right border-l border-neutral-200 pl-4">
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Saida</p>
                        <p className="font-bold text-neutral-700">{new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-neutral-500 text-[10px] font-black uppercase tracking-widest">
                        <Building2 className="w-4 h-4 text-amber-500" />
                        {res.category} - {res.guests_per_uh} Pessoa(s) - {paymentMethodLabel[res.payment_method] || res.payment_method}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => setCancelRequest({ item: res, reason: '' })}
                          className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-100"
                        >
                          <Ban className="h-3 w-3" />
                          Cancelar
                        </button>
                        <button
                          onClick={() => handlePrepareExtension(res)}
                          className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-700 transition-all hover:bg-amber-100"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Prorrogar
                        </button>
                        <button 
                          onClick={() => setViewingVoucher(res)}
                          className="text-neutral-900 border border-neutral-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Eye className="w-3 h-3" />
                          Ver Voucher
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">Nenhuma reserva ativa</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reservations ready for billing/debit */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center">
                <h4 className="font-bold flex items-center gap-2 text-neutral-500">
                  <CreditCard className="w-5 h-5 text-neutral-400" />
                  A faturar / debitar
                </h4>
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {checkedOutReservations.length > 0 ? checkedOutReservations.map(res => (
                  <div key={res.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-bold text-neutral-700 text-base uppercase tracking-tight">{res.guest_name}</p>
                        <p className="text-[10px] text-neutral-400 font-mono tracking-widest">{res.reservation_code}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700">
                        {paymentMethodLabel[res.payment_method] || 'A COBRAR'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[10px] text-neutral-500 font-medium">
                        Saida em {new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')} - Total {clientMoney(Number(res.total_amount || 0))}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button 
                          onClick={() => setViewingVoucher(res)}
                          className="text-neutral-900 border border-neutral-200 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-neutral-100 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Eye className="w-3 h-3" />
                          Voucher
                        </button>
                        <button 
                          onClick={() => handlePrepareExtension(res)}
                          className="text-amber-600 bg-amber-50 border border-amber-100 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          Nova diaria
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <p className="text-[10px] font-bold uppercase tracking-widest italic">Nenhuma hospedagem aguardando faturamento/debito</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pending Requests */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
                <h4 className="font-bold flex items-center gap-2 text-amber-600">
                  <Clock className="w-5 h-5" />
                  Solicitacoes em Analise
                </h4>
                {rejectedRequests.length > 0 && (
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-red-500">
                    {rejectedRequests.length} negada(s) no historico
                  </p>
                )}
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {reservationRequests.length > 0 ? reservationRequests.map(req => (
                  <div key={req.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-black text-neutral-900 text-lg uppercase tracking-tight">{req.guest_name}</p>
                        <p className="text-xs text-neutral-400 font-mono tracking-widest font-bold">{req.reservation_code}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                        req.status === 'REJECTED' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse'
                      }`}>
                        {reservationStatusLabel[req.status] || req.status}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-2 font-black uppercase tracking-widest bg-neutral-50 px-3 py-1 rounded-lg">
                        <Calendar className="w-3.5 h-3.5" />
                        Solicitado em {new Date(req.created_at).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {req.status === 'REQUESTED' && (
                          <button
                            onClick={() => setCancelRequest({ item: req, reason: '' })}
                            className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-100"
                          >
                            <Ban className="h-3 w-3" />
                            Cancelar
                          </button>
                        )}
                        <button 
                          onClick={() => setViewingVoucher(req)}
                          className="text-neutral-900 border border-neutral-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all shadow-sm"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[11px] mt-2">Novas solicitacoes aparecerao aqui ate serem aprovadas ou negadas pela equipe de reservas.</p>
                    <p className="text-xs font-bold uppercase tracking-widest">Nenhuma solicitacao pendente</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Guidelines for alterations */}
          <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg rotate-3 group hover:rotate-0 transition-transform duration-300">
                <AlertTriangle className="w-8 h-8 text-black" />
              </div>
              <div className="text-left">
                <p className="font-black text-white text-xl uppercase tracking-tighter mb-1">Precisa alterar ou cancelar uma reserva?</p>
                <p className="text-neutral-500 text-xs max-w-xl mt-2">Assim mantemos disponibilidade, tarifa e historico da reserva sob controle.</p>
                <p className="text-neutral-400 text-sm max-w-xl font-medium">Por seguranca, alteracoes em reservas ja processadas devem ser enviadas ao nosso setor comercial. Nossa equipe analisara a disponibilidade e as tarifas vigentes.</p>
              </div>
            </div>
            <a 
              href={`mailto:reservas@royalmacaepms.com.br?subject=Solicitacao de Alteracao de Reserva - ${company?.name}`}
              className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-amber-500 hover:text-black transition-all active:scale-95 shadow-lg shrink-0"
            >
              <Mail className="w-5 h-5" />
              Falar com Reservas
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ClientPortalKpi label="A pagar" value={openDebtTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} tone={overdueInvoices.length ? 'red' : 'ink'} />
            <ClientPortalKpi label="Vencidas" value={overdueInvoices.length} tone="red" />
            <ClientPortalKpi label="Com comprovante" value={activeFiles.filter(file => file.proof_url).length} tone="emerald" />
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 lg:flex-row lg:flex-wrap lg:items-center"
          >
        <div className="flex items-center gap-2 text-neutral-500 mr-2">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filtros:</span>
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        >
          <option value="ALL">Todos os Tipos</option>
          <option value="NF">NF</option>
          <option value="DANFE">DANFE</option>
          <option value="EXTRATO">EXTRATO</option>
          <option value="FATURA">FATURA</option>
          <option value="Hospedagem">Hospedagem</option>
          <option value="Alimentação">Alimentação</option>
          <option value="Lavanderia">Lavanderia</option>
          <option value="Eventos">Eventos</option>
          <option value="Transporte">Transporte</option>
          <option value="OUTRO">OUTROS</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">De:</span>
          <input
            type="month"
            value={filterPeriodStart}
            onChange={(e) => setFilterPeriodStart(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <span className="text-xs text-neutral-400">Até:</span>
          <input
            type="month"
            value={filterPeriodEnd}
            onChange={(e) => setFilterPeriodEnd(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        {(filterType !== 'ALL' || filterPeriodStart || filterPeriodEnd) && (
          <button
            onClick={() => { setFilterType('ALL'); setFilterPeriodStart(''); setFilterPeriodEnd(''); }}
            className="text-xs text-neutral-400 hover:text-neutral-900 underline"
          >
            Limpar Filtros
          </button>
        )}
      </motion.div>

      {/* File List */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Vencimento/Comp.</th>
                <th className="px-6 py-3 font-medium">Nome do Arquivo</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredFiles.map(file => (
                <tr key={file.id} className="hover:bg-neutral-50 transition-colors group">
                  <td className="px-6 py-4 text-sm">
                    {!file.viewed_by_client ? (
                      <span className="flex items-center gap-1.5 text-amber-600 font-bold text-[10px] uppercase bg-amber-50 px-2 py-1 rounded-full w-fit animate-pulse">
                        <Clock className="w-3 h-3" />
                        Novo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-neutral-400 font-medium text-[10px] uppercase bg-neutral-50 px-2 py-1 rounded-full w-fit">
                        <CheckCircle2 className="w-3 h-3" />
                        Lido
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 bg-neutral-100 rounded text-[10px] font-bold text-neutral-600 uppercase">
                      {file.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {FINANCIAL_TYPES.includes(file.type) && file.due_date ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-neutral-700">
                          {new Date(file.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        {(() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const due = new Date(file.due_date + 'T12:00:00');
                          due.setHours(0, 0, 0, 0);
                          
                          if (due < today) return <span className="text-[10px] font-bold text-red-500 uppercase">Vencida</span>;
                          if (due.getTime() === today.getTime()) return <span className="text-[10px] font-bold text-amber-500 uppercase">Vence Hoje</span>;
                          return <span className="text-[10px] font-bold text-green-500 uppercase">A Vencer</span>;
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">{file.period || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-900 font-medium">
                    {file.original_name}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {activeTab === 'trash' && canManageClientArchive ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRecoverFile(file.id, file.original_name)}
                            className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                            title="Recuperar Arquivo"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteFile(file.id, file.original_name)}
                            className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                            title="Excluir Permanentemente"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {FINANCIAL_TYPES.includes(file.type) && file.status !== 'CANCELLED' && (
                            <>
                              {!file.proof_url ? (
                                <button
                                  onClick={() => {
                                    setSelectedFileId(file.id);
                                    setProofModalOpen(true);
                                  }}
                                  className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                                  title="Enviar Comprovante"
                                >
                                  <Receipt className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="p-2 text-green-600" title="Comprovante Enviado">
                                  <CheckCircle2 className="w-4 h-4" />
                                </span>
                              )}
                              {!file.dispute_at ? (
                                <button
                                  onClick={() => {
                                    setSelectedFileId(file.id);
                                    setDisputeModalOpen(true);
                                  }}
                                  className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                                  title="Informar Erro / Contestar"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => setViewingDispute(file)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Ver Contestação"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handlePreview(file)}
                            className="inline-flex items-center gap-2 bg-neutral-100 text-neutral-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-neutral-200 transition-all"
                          >
                            <Eye className="w-3 h-3" />
                            Ver
                          </button>
                          {file.download_url && (
                            <a
                              href={file.download_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => handleDownload(file)}
                              className="inline-flex items-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-neutral-800 transition-all transform group-hover:scale-105"
                            >
                              <Download className="w-3 h-3" />
                              Baixar
                            </a>
                          )}
                          {canManageClientArchive && (
                            <button
                              onClick={() => handleMoveToTrash(file.id, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Mover para Lixeira"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 text-sm">
                    Nenhum documento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
        </>
      )}

      {/* Cancellation Request Modal */}
      <AnimatePresence>
        {cancelRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="border-b border-red-100 bg-red-50 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-500">Pedido de cancelamento</p>
                    <h3 className="mt-2 text-2xl font-black text-neutral-950">{cancelRequest.item.reservation_code}</h3>
                    <p className="mt-1 text-sm font-bold text-neutral-600">{cancelRequest.item.guest_name}</p>
                  </div>
                  <button onClick={() => setCancelRequest(null)} className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-900">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <VoucherField label="Entrada" value={clientDate(cancelRequest.item.check_in)} />
                  <VoucherField label="Saida" value={clientDate(cancelRequest.item.check_out)} />
                  <VoucherField label="Status" value={reservationStatusLabel[cancelRequest.item.status] || cancelRequest.item.status} />
                  <VoucherField label="Pagamento" value={paymentMethodLabel[cancelRequest.item.payment_method] || cancelRequest.item.payment_method} />
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-xs font-bold leading-5 text-amber-900">
                    O portal nao cancela automaticamente para evitar conflito com disponibilidade, no-show, faturamento e possiveis taxas. A equipe de reservas recebera o pedido e confirmara o retorno.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-400">Motivo do cancelamento</label>
                  <textarea
                    value={cancelRequest.reason}
                    onChange={(event) => setCancelRequest({ ...cancelRequest, reason: event.target.value })}
                    placeholder="Ex: viagem cancelada, troca de data, hospede nao ira comparecer..."
                    className="min-h-[120px] w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setCancelRequest(null)}
                    className="flex-1 rounded-xl border border-neutral-200 px-6 py-3 text-sm font-black text-neutral-600 transition-colors hover:bg-neutral-50"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={sendingCancelRequest}
                    onClick={handleRequestCancellation}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {sendingCancelRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar pedido
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reservation Request Modal */}
      <AnimatePresence>
        {showReservationForm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-[96vw] max-w-[1800px] rounded-3xl overflow-hidden shadow-2xl my-4"
            >
              <div className="p-8 border-b border-neutral-100 bg-neutral-900 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl -mr-16 -mt-16"></div>
                <div className="relative z-10">
                  <h3 className="text-2xl font-black uppercase tracking-tighter italic">Solicitar Reserva</h3>
                  <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mt-1">Portal Corporativo • {company?.name}</p>
                </div>
                <button onClick={() => setShowReservationForm(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleRequestReservation} className="max-h-[82vh] overflow-y-auto p-4 custom-scrollbar sm:p-6 lg:p-8">
                <div className="grid gap-7 xl:grid-cols-[minmax(760px,1fr)_620px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Solicitante</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        required
                        type="text"
                        value={reservationForm.requested_by}
                        onChange={(e) => setReservationForm({ ...reservationForm, requested_by: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                        placeholder="Nome de quem esta solicitando a reserva"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      Esse nome aparecera no voucher e no historico da solicitacao.
                    </p>
                  </div>

                  {/* Guest Info */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Nome Completo do Hóspede</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        required
                        type="text"
                        value={reservationForm.guest_name}
                        onChange={(e) => {
                          const pax = [...reservationForm.pax_names];
                          pax[0] = e.target.value;
                          setReservationForm({...reservationForm, guest_name: e.target.value, pax_names: pax});
                        }}
                        className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                        placeholder="Ex: João Silva"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Lista de PAX no voucher</p>
                        <p className="mt-1 text-xs text-neutral-500">O primeiro PAX continua como hospede principal para compatibilidade.</p>
                      </div>
                      <button type="button" onClick={addPaxName} className="rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-700 ring-1 ring-neutral-200">
                        + PAX
                      </button>
                    </div>
                    <div className="space-y-2">
                      {reservationForm.pax_names.map((pax, index) => (
                        <div key={index} className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            required={index === 0}
                            type="text"
                            value={pax}
                            onChange={(e) => setPaxName(index, e.target.value)}
                            className="w-full pl-12 pr-12 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                            placeholder={index === 0 ? 'PAX principal / responsavel' : `PAX adicional ${index + 1}`}
                          />
                          {reservationForm.pax_names.length > 1 && (
                            <button type="button" onClick={() => removePaxName(index)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-neutral-100 bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Calendario de disponibilidade</p>
                        <p className="mt-1 text-xs font-bold text-neutral-500">
                          Verde disponivel. Vermelho bloqueado em Reservas &gt; Bloqueio de Datas.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                          className="h-9 w-9 rounded-full border border-neutral-200 bg-white text-sm font-black text-neutral-700 hover:bg-neutral-100"
                          aria-label="Mes anterior"
                        >
                          &lt;
                        </button>
                        <div className="min-w-[150px] text-center text-sm font-black uppercase tracking-widest text-neutral-900">
                          {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                          className="h-9 w-9 rounded-full border border-neutral-200 bg-white text-sm font-black text-neutral-700 hover:bg-neutral-100"
                          aria-label="Proximo mes"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(day => <div key={day}>{day}</div>)}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-1">
                        {reservationCalendarDays.map(day => {
                          const tone = day.isPast
                            ? 'border-neutral-100 bg-neutral-100 text-neutral-300 cursor-not-allowed'
                            : day.block
                              ? 'border-red-200 bg-red-50 text-red-700 cursor-not-allowed'
                              : day.inStay || day.isCheckIn || day.isCheckOut
                                ? 'border-neutral-950 bg-neutral-950 text-white'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100';
                          return (
                            <button
                              key={day.iso}
                              type="button"
                              onClick={() => handleCalendarDayClick(day.iso)}
                              className={`min-h-[54px] rounded-xl border p-2 text-left transition-all ${tone} ${day.inMonth ? '' : 'opacity-40'}`}
                              title={day.block?.reason || (day.available ? 'Disponivel' : 'Indisponivel')}
                            >
                              <span className="block text-sm font-black">{day.date.getDate()}</span>
                              <span className="mt-1 block truncate text-[9px] font-black uppercase tracking-widest opacity-70">
                                {day.isCheckIn ? 'Entrada' : day.isCheckOut ? 'Saida' : day.block ? 'Bloq.' : 'Livre'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-4 flex flex-col gap-2 text-xs font-bold text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-3">
                          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Disponivel</span>
                          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" /> Bloqueado</span>
                          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-neutral-950" /> Selecionado</span>
                        </div>
                        {selectedRangeUnavailable ? (
                          <span className="font-black text-red-600">
                            {selectedRangeBlock?.reason || 'Periodo indisponivel para reserva.'}
                          </span>
                        ) : reservationForm.check_in && reservationForm.check_out ? (
                          <span className="font-black text-emerald-700">Periodo liberado para solicitacao.</span>
                        ) : (
                          <span>Clique primeiro na entrada e depois na saida.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Corporate Details */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Centro de Custo</label>
                    <input
                      required
                      type="text"
                      value={reservationForm.cost_center}
                      onChange={(e) => setReservationForm({...reservationForm, cost_center: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="Ex: Financeiro-01"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Perfil fiscal / CC salvo</label>
                    <select
                      value={reservationForm.billing_profile_id}
                      onChange={(e) => applyBillingProfile(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="">Preencher manualmente</option>
                      {billingProfiles.map(item => (
                        <option key={item.id} value={item.id}>{item.name}{item.cost_center ? ` - ${item.cost_center}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Forma de Pagamento</label>
                    <select
                      value={reservationForm.payment_method}
                      onChange={(e) => setReservationForm({...reservationForm, payment_method: e.target.value as any})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="BILLED">Faturado para Empresa</option>
                      <option value="VIRTUAL_CARD">Cartão Virtual / Voucher</option>
                    </select>
                  </div>

                  {/* Room Details */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Categoria</label>
                    <select
                      value={reservationForm.category}
                      onChange={(e) => setReservationForm({...reservationForm, category: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="executivo">Executivo</option>
                      <option value="superior">Superior</option>
                      <option value="master">Master</option>
                      <option value="suite presidencial">Suíte Presidencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Hóspedes por UH</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="4"
                      value={reservationForm.guests_per_uh}
                      onChange={(e) => setReservationForm({...reservationForm, guests_per_uh: parseInt(e.target.value)})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Ocupacao</label>
                    <select
                      value={reservationForm.occupancy_type}
                      onChange={(e) => setReservationForm({ ...reservationForm, occupancy_type: e.target.value as any })}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="SGL">SGL - Single</option>
                      <option value="DBL">DBL - Double</option>
                      <option value="TPL">TPL - Triple</option>
                      <option value="QDL">QDL - Quadruplo</option>
                    </select>
                  </div>

                  {/* Financials */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Tarifa (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={reservationForm.tariff}
                      readOnly={Boolean(selectedCorporateTariff)}
                      onChange={(e) => setReservationForm({...reservationForm, tariff: parseFloat(e.target.value)})}
                      className={`w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all ${selectedCorporateTariff ? 'bg-emerald-50 font-black text-emerald-900' : 'bg-neutral-50'}`}
                    />
                    {selectedCorporateTariff ? (
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                        Tarifa acordo aplicada automaticamente: {selectedCorporateTariff.company_name}
                      </p>
                    ) : corporateTariffs.length > 0 ? (
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
                        Sem tarifa acordo para esta categoria/ocupacao.
                      </p>
                    ) : (
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Nenhuma tarifa acordo vinculada a esta empresa.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Telefone p/ Contato</label>
                    <input
                      required
                      type="tel"
                      value={reservationForm.contact_phone}
                      onChange={(e) => setReservationForm({...reservationForm, contact_phone: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="(22) 99999-9999"
                    />
                  </div>

                  <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 md:col-span-2">
                     <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">ISS e taxas opcionais</p>
                         <p className="mt-1 text-xs text-neutral-500">Marque somente quando a política da empresa exigir composição com imposto ou taxa.</p>
                       </div>
                       <p className="text-sm font-black text-neutral-900">
                         Total previsto: {clientMoney(calculateReservationTotal(reservationForm).total)}
                       </p>
                     </div>
                     <div className="grid gap-3 sm:grid-cols-2">
                        <div className={`rounded-xl border p-3 ${reservationForm.iss_enabled ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-neutral-100'}`}>
                          <label className="flex cursor-pointer items-center justify-between gap-3">
                            <span className="text-xs font-black uppercase tracking-widest text-neutral-700">ISS</span>
                            <input
                              type="checkbox"
                              checked={reservationForm.iss_enabled}
                              onChange={(e) => setReservationForm({ ...reservationForm, iss_enabled: e.target.checked })}
                              className="h-4 w-4 accent-neutral-900"
                            />
                          </label>
                          {reservationForm.iss_enabled && (
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={reservationForm.iss_tax}
                                onChange={(e) => setReservationForm({ ...reservationForm, iss_tax: parseFloat(e.target.value) || 0 })}
                                className="w-24 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-bold outline-none"
                              />
                              <span className="text-xs font-bold text-neutral-500">% sobre tarifa</span>
                            </div>
                          )}
                        </div>
                        <div className={`rounded-xl border p-3 ${reservationForm.service_enabled ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-neutral-100'}`}>
                          <label className="flex cursor-pointer items-center justify-between gap-3">
                            <span className="text-xs font-black uppercase tracking-widest text-neutral-700">Taxa de serviço</span>
                            <input
                              type="checkbox"
                              checked={reservationForm.service_enabled}
                              onChange={(e) => setReservationForm({ ...reservationForm, service_enabled: e.target.checked })}
                              className="h-4 w-4 accent-neutral-900"
                            />
                          </label>
                          {reservationForm.service_enabled && (
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={reservationForm.service_tax}
                                onChange={(e) => setReservationForm({ ...reservationForm, service_tax: parseFloat(e.target.value) || 0 })}
                                className="w-24 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-bold outline-none"
                              />
                              <span className="text-xs font-bold text-neutral-500">% sobre tarifa</span>
                            </div>
                          )}
                        </div>
                     </div>
                  </div>

                  {/* Large text areas */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Observações para Faturamento</label>
                    <textarea
                      value={reservationForm.billing_obs}
                      onChange={(e) => setReservationForm({...reservationForm, billing_obs: e.target.value})}
                      placeholder="Instruções específicas para a nota fiscal ou faturamento..."
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all min-h-[80px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Informações para Emissão de Nota Fiscal</label>
                    <textarea
                      value={reservationForm.billing_info}
                      onChange={(e) => setReservationForm({...reservationForm, billing_info: e.target.value})}
                      placeholder="CNPJ, Razão Social, Endereço e E-mail de destino da NF..."
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all min-h-[80px]"
                    />
                  </div>
                </div>

                <aside className="xl:sticky xl:top-0 xl:self-start">
                  <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-100 shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-950 p-4 text-white">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400">Preview oficial</p>
                        <h4 className="mt-1 text-lg font-black uppercase tracking-tight">Voucher</h4>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${selectedRangeUnavailable ? 'bg-red-100 text-red-700' : reservationForm.check_in && reservationForm.check_out ? 'bg-emerald-100 text-emerald-700' : 'bg-white/10 text-white/70'}`}>
                        {selectedRangeUnavailable ? 'Bloqueado' : reservationForm.check_in && reservationForm.check_out ? 'Liberado' : 'Pendente'}
                      </div>
                    </div>
                    <div className="h-[calc(82vh-178px)] min-h-[660px] overflow-auto bg-neutral-200 p-5 custom-scrollbar">
                      <div className="origin-top-left" style={{ width: 820, zoom: 0.68 }}>
                        <TravelVoucherPreview voucher={reservationDraftVoucher} company={company} hotelProfile={hotelProfile} />
                      </div>
                    </div>
                    {selectedRangeUnavailable && (
                      <div className="border-t border-red-200 bg-red-50 p-4 text-xs font-black leading-5 text-red-700">
                        {selectedRangeBlock?.reason || 'Periodo indisponivel para reserva.'}
                      </div>
                    )}
                  </div>
                </aside>
                </div>

                <div className="pt-4">
                  <button
                    disabled={submittingReservation || Boolean(selectedRangeUnavailable)}
                    type="submit"
                    className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-neutral-800 transition-all shadow-xl flex items-center justify-center gap-2 group disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
                  >
                    {submittingReservation ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Enviar Solicitação de Reserva
                        <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voucher Detail Modal */}
      <AnimatePresence>
        {viewingVoucher && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="my-8 w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <TravelVoucherPreview voucher={viewingVoucher} company={company} hotelProfile={hotelProfile} />
              <div id="voucher-print-old" className="hidden">
                <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200 p-4 pl-8 shadow-sm sm:p-8 sm:pl-12">
                  <div className="absolute inset-y-0 left-0 w-5 bg-neutral-950" />
                  <div className="absolute left-5 right-0 top-0 h-2 bg-amber-600" />
                  <div className="relative flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <img src="/logo.png" alt="Royal Macaé" className="h-12 w-20 object-contain" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-700">Voucher oficial de reserva</p>
                        <h2 className="mt-1 text-2xl font-black uppercase leading-none tracking-tight text-neutral-950 sm:text-3xl">{(viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'Reserva em análise' : 'Hospedagem confirmada'}</h2>
                        <p className="mt-2 text-xs font-bold text-neutral-500">{hotelProfile.trade_name || hotelProfile.legal_name || 'Hotel'} - documento para recepção, reservas e faturamento corporativo.</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-neutral-950 p-4 text-left text-white sm:text-right">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Localizador</p>
                      <p className="mt-1 font-mono text-xl font-black tracking-widest">{viewingVoucher.reservation_code}</p>
                      <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/50">Status</p>
                      <p className="text-sm font-black">{(viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'EM ANÁLISE' : 'CONFIRMADA'}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-2xl bg-neutral-950 p-4 text-white sm:grid-cols-3">
                    {[
                      ['Hotel', hotelProfile.trade_name || hotelProfile.legal_name || 'Hotel'],
                      ['CNPJ hotel', hotelProfile.cnpj || '-'],
                      ['Contato hotel', hotelProfile.phone || hotelProfile.email || '-'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{label}</p>
                        <p className="mt-1 font-black text-white">{value}</p>
                      </div>
                    ))}
                    <div className="sm:col-span-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Endereco oficial</p>
                      <p className="mt-1 text-xs font-bold text-white">{hotelProfile.address || '-'}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
                      <p className="text-[9px] font-black uppercase tracking-[0.24em] text-neutral-500">Hospede e periodo</p>
                      <h3 className="mt-2 text-2xl font-black text-neutral-950">{getReservationPaxNames(viewingVoucher)[0] || viewingVoucher.guest_name}</h3>
                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <VoucherField label="Entrada" value={clientDate(viewingVoucher.check_in)} />
                        <VoucherField label="Saída" value={clientDate(viewingVoucher.check_out)} />
                        <VoucherField label="Categoria" value={viewingVoucher.category} />
                        <VoucherField label="Ocupação" value={OCCUPANCY_LABELS[viewingVoucher.occupancy_type || deriveOccupancyType(viewingVoucher.guests_per_uh)]} />
                      </div>
                    </div>
                    <div className="rounded-3xl bg-neutral-950 p-5 text-white">
                      <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/50">Empresa vinculada</p>
                      <h3 className="mt-2 text-xl font-black text-white">{company?.name || 'Empresa não vinculada'}</h3>
                      <div className="mt-4 space-y-2 text-xs font-bold text-white/70">
                        <p>CNPJ: {company?.cnpj || '-'}</p>
                        <p>Centro de custo: {viewingVoucher.cost_center || '-'}</p>
                        <p>Contato: {viewingVoucher.contact_phone || company?.phone || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <VoucherMetric label="Solicitação" value={(viewingVoucher as ReservationRequest).created_at ? clientDate((viewingVoucher as ReservationRequest).created_at) : '-'} />
                    <VoucherMetric label="Pagamento" value={viewingVoucher.payment_method === 'BILLED' ? 'Faturado' : 'Cartão virtual'} />
                    <VoucherMetric label="Tarifa" value={clientMoney(Number(viewingVoucher.tariff || 0))} />
                    <VoucherMetric label="Total previsto" value={clientMoney(Number(viewingVoucher.total_amount || 0))} strong />
                  </div>

                  <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-neutral-500">PAX autorizados</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {getReservationPaxNames(viewingVoucher).map((pax, index) => (
                        <p key={`${pax}-${index}`} className="rounded-xl bg-neutral-50 px-3 py-2 text-xs font-black text-neutral-800">
                          {index + 1}. {pax}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <VoucherNote title="Instruções de faturamento" text={viewingVoucher.billing_obs || 'Sem observações adicionais.'} />
                    <VoucherNote title="Dados para emissão de nota" text={viewingVoucher.billing_info || 'Utilizar dados cadastrais da empresa/agência.'} />
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-8 pt-8">
                    <div className="border-t border-neutral-900 pt-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{hotelProfile.trade_name || hotelProfile.legal_name || 'Hotel'}</p>
                      <p className="mt-1 text-[10px] text-neutral-500">Reservas / Recepção</p>
                    </div>
                    <div className="border-t border-neutral-900 pt-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Cliente corporativo</p>
                      <p className="mt-1 text-[10px] text-neutral-500">Validação da empresa</p>
                    </div>
                  </div>

                  <p className="mt-6 border-t border-neutral-200 pt-3 text-center text-[10px] font-bold text-neutral-400">
                    Emitido em {new Date().toLocaleString('pt-BR')} - {[hotelProfile.email, hotelProfile.website].filter(Boolean).join(' - ') || 'Voucher corporativo'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50 p-4 sm:flex-row sm:justify-end sm:p-6">
                <button onClick={() => setViewingVoucher(null)} className="rounded-xl px-6 py-3 text-xs font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-neutral-900">
                  Fechar
                </button>
                <button onClick={handleDownloadTravelVoucherPdf} className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-neutral-800">
                  <Printer className="h-4 w-4" />
                  Gerar PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Proof Upload Modal */}
      <AnimatePresence>
        {proofModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-green-600" />
                  Enviar Comprovante
                </h3>
                <button onClick={() => setProofModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-neutral-500">
                  Selecione o arquivo do comprovante de pagamento para esta fatura.
                </p>
                <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center hover:border-neutral-300 transition-colors relative">
                  <input
                    type="file"
                    onChange={handleUploadProof}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={uploadingProof}
                  />
                  {uploadingProof ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
                      <span className="text-sm text-neutral-500">Enviando...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-neutral-400" />
                      <span className="text-sm font-medium text-neutral-600">Clique ou arraste o arquivo</span>
                      <span className="text-[10px] text-neutral-400">PDF, JPG ou PNG</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dispute Modal */}
      <AnimatePresence>
        {disputeModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Contestar Fatura / Informar Erro
                </h3>
                <button onClick={() => setDisputeModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSendDispute} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Motivo da Contestação</label>
                  <textarea
                    required
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Descreva o erro encontrado na fatura..."
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 min-h-[120px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Anexar Imagens (Opcional)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {disputeFiles.map((f, i) => (
                      <div key={i} className="px-3 py-1 bg-neutral-100 rounded-full text-[10px] flex items-center gap-2">
                        {f.name}
                        <button type="button" onClick={() => setDisputeFiles(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setDisputeFiles(prev => [...prev, ...files]);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-100 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200 transition-colors w-fit">
                      <ImageIcon className="w-4 h-4" />
                      Adicionar Imagens
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDisputeModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-neutral-200 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingProof}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Contestação
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Dispute Modal */}
      <AnimatePresence>
        {viewingDispute && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Detalhes da Contestação
                </h3>
                <button onClick={() => setViewingDispute(null)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase mb-1">Seu Motivo</p>
                  <p className="text-sm text-red-900">{viewingDispute.disputeReason}</p>
                  <p className="text-[10px] text-red-400 mt-2">Enviado em: {new Date(viewingDispute.disputeAt || '').toLocaleString('pt-BR')}</p>
                  
                  {viewingDispute.dispute_images && viewingDispute.dispute_images.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-red-600 uppercase mb-2">Imagens Anexadas</p>
                      <div className="flex flex-wrap gap-2">
                        {viewingDispute.dispute_images.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-red-200 hover:opacity-80 transition-opacity">
                            <img src={img} alt={`Anexo ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {viewingDispute.disputeResponse ? (
                  <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-bold text-green-600 uppercase mb-2">Resposta do Administrador</p>
                    <p className="text-sm text-neutral-800 italic">"{viewingDispute.disputeResponse}"</p>
                    <p className="text-[10px] text-neutral-400 mt-3 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      Resolvido em: {new Date(viewingDispute.disputeResolvedAt || '').toLocaleString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Aguardando Resposta</p>
                      <p className="text-xs text-amber-700">O administrador ainda não analisou sua contestação.</p>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => setViewingDispute(null)}
                    className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
