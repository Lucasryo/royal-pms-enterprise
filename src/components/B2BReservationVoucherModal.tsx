import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { supabase } from '../supabase';
import { Company, Reservation, VoucherHotelProfile } from '../types';
import {
  DEFAULT_VOUCHER_HOTEL_PROFILE,
  deriveOccupancyType,
  getReservationPaxNames,
  OCCUPANCY_LABELS,
} from '../lib/voucher';

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';

function nightsOf(reservation: Reservation) {
  const start = new Date(`${reservation.check_in}T12:00:00`).getTime();
  const end = new Date(`${reservation.check_out}T12:00:00`).getTime();
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

function totalsOf(reservation: Reservation) {
  const tariff = Number(reservation.tariff || 0);
  const nights = nightsOf(reservation);
  const iss = Number(reservation.iss_tax || 0) > 0 ? tariff * (Number(reservation.iss_tax || 0) / 100) : 0;
  const service = Number(reservation.service_tax || 0) > 0 ? tariff * (Number(reservation.service_tax || 0) / 100) : 0;
  const total = Number(reservation.total_amount || 0) || (tariff + iss + service) * nights;
  return { tariff, iss, service, nights, total };
}

export default function B2BReservationVoucherModal({
  reservation,
  company,
  onClose,
}: {
  reservation: Reservation;
  company: Company | null;
  onClose: () => void;
}) {
  const [hotelProfile, setHotelProfile] = useState<VoucherHotelProfile>(DEFAULT_VOUCHER_HOTEL_PROFILE);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from('app_settings')
      .select('value')
      .eq('id', 'voucher_hotel_profile')
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data?.value) return;
        try {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setHotelProfile({ ...DEFAULT_VOUCHER_HOTEL_PROFILE, ...parsed });
        } catch {
          setHotelProfile(DEFAULT_VOUCHER_HOTEL_PROFILE);
        }
      });
    return () => { alive = false; };
  }, []);

  async function downloadPdf() {
    setGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      drawVoucherPdf(pdf, reservation, company, hotelProfile);
      pdf.save(`AUTORIZACAO_HOSPEDAGEM_${reservation.reservation_code || reservation.id}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-950 px-5 py-4 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Voucher B2B</p>
            <h2 className="mt-1 text-xl font-black">Voucher da reserva {reservation.reservation_code}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-black text-neutral-950 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Fechar voucher">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-neutral-100 p-4 sm:p-6">
          <ReservationVoucherPdf reservation={reservation} company={company} hotelProfile={hotelProfile} />
        </div>
      </div>
    </div>
  );
}

function drawVoucherPdf(pdf: jsPDF, reservation: Reservation, company: Company | null, hotelProfile: VoucherHotelProfile) {
  const margin = 12;
  const right = 198;
  const code = reservation.reservation_code || 'PENDENTE';
  const paxNames = getReservationPaxNames(reservation);
  const occupancy = reservation.occupancy_type || deriveOccupancyType(reservation.guests_per_uh);
  const totals = totalsOf(reservation);
  const hotelName = hotelProfile.trade_name || hotelProfile.legal_name || 'Royal Macae';
  const hotelAddress = hotelProfile.address || 'Endereco nao informado';
  const hotelContacts = [hotelProfile.cnpj ? `CNPJ ${hotelProfile.cnpj}` : '', hotelProfile.phone, hotelProfile.email].filter(Boolean).join(' - ');
  const fiscalInfo = reservation.billing_info || 'Utilizar dados cadastrais da empresa/agencia.';
  const billingInstructions = reservation.billing_obs || 'Sem observacoes adicionais.';

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
  pdf.text('CONFIRMADA', right, 39, { align: 'right' });
  pdf.line(margin, 58, right, 58);

  pdf.roundedRect(margin, 64, 112, 44, 2, 2);
  pdf.setFontSize(7);
  pdf.text('HOSPEDE E PERIODO', margin + 4, 72);
  pdf.setFontSize(15);
  pdf.text(String(paxNames[0] || reservation.guest_name || '-'), margin + 4, 82, { maxWidth: 104 });
  const guestRows = [
    ['ENTRADA', dateBR(reservation.check_in)],
    ['SAIDA', dateBR(reservation.check_out)],
    ['CATEGORIA', reservation.category || '-'],
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
  pdf.text(company?.name || 'Empresa nao vinculada', 134, 82, { maxWidth: 58 });
  pdf.setFontSize(7);
  pdf.text(`CNPJ: ${company?.cnpj || '-'}`, 134, 92, { maxWidth: 58 });
  pdf.text(`Centro de custo: ${reservation.cost_center || '-'}`, 134, 98, { maxWidth: 58 });
  pdf.text(`Contato: ${reservation.contact_phone || company?.phone || '-'}`, 134, 104, { maxWidth: 58 });

  const metricY = 118;
  const metricW = (right - margin - 6) / 3;
  [
    ['PAGAMENTO', 'Faturado'],
    ['TARIFA', money(totals.tariff)],
    ['TOTAL PREVISTO', money(Number(reservation.total_amount || totals.total))],
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
  pdf.text(`Solicitado em: ${reservation.created_at ? dateBR(reservation.created_at) : '-'}`, margin + 3, y + 7);
  pdf.text(`Tipo UH: ${reservation.category || '-'} | Pessoas/UH: ${reservation.guests_per_uh || '-'}`, 104, y + 7);
  y += 18;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('COMPOSICAO PREVISTA', margin, y);
  pdf.text('Pagina 1 de 1', right, y, { align: 'right' });
  y += 5;
  pdf.setFillColor(212, 212, 212);
  pdf.rect(margin, y, right - margin, 8, 'F');
  pdf.text('Descricao', margin + 3, y + 5.5);
  pdf.text('Valor', right - 3, y + 5.5, { align: 'right' });
  y += 12;
  const rows: Array<[string, number]> = [['Tarifa acordada', totals.tariff]];
  if (totals.iss > 0) rows.push([`ISS ${reservation.iss_tax}%`, totals.iss]);
  if (totals.service > 0) rows.push([`Taxa de servico ${reservation.service_tax}%`, totals.service]);
  rows.forEach(([label, value]) => {
    pdf.text(label, margin + 3, y);
    pdf.text(money(value), right - 3, y, { align: 'right' });
    y += 8;
  });

  const notesY = Math.max(y + 10, 188);
  pdf.roundedRect(margin, notesY, 86, 35, 2, 2);
  pdf.setFontSize(6);
  pdf.text('INSTRUCOES DE FATURAMENTO', margin + 3, notesY + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(pdf.splitTextToSize(String(billingInstructions), 78), margin + 3, notesY + 12);
  pdf.setFont('helvetica', 'bold');
  pdf.roundedRect(104, notesY, 94, 35, 2, 2);
  pdf.setFontSize(6);
  pdf.text('DADOS PARA EMISSAO DE NOTA', 107, notesY + 6);
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
}

function ReservationVoucherPdf({
  reservation,
  company,
  hotelProfile,
}: {
  reservation: Reservation;
  company: Company | null;
  hotelProfile: VoucherHotelProfile;
}) {
  const code = reservation.reservation_code || 'PENDENTE';
  const paxNames = getReservationPaxNames(reservation);
  const occupancy = reservation.occupancy_type || deriveOccupancyType(reservation.guests_per_uh);
  const totals = totalsOf(reservation);
  const bars = code.padEnd(20, '0').slice(0, 20).split('');

  return (
    <div id="b2b-reservation-voucher-pdf" className="mx-auto w-full max-w-[820px] bg-white p-5 text-neutral-950 shadow-sm">
      <div className="min-h-[760px] border border-blue-200 p-5">
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
                {bars.map((char, index) => (
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
            <p><strong>STATUS</strong><span className="ml-[77px]">Reserva confirmada</span></p>
            <p><strong>EMPRESA</strong><span className="ml-[67px]">{company?.name || 'Particular'}</span></p>
            <p><strong>SOLICITANTE</strong><span className="ml-[42px]">{reservation.requested_by || '-'}</span></p>
            <p><strong>EMITIDO EM</strong><span className="ml-[48px]">{new Date().toLocaleString('pt-BR')}</span></p>
          </div>
          <div className="space-y-1">
            <p><strong>HOTEL</strong><span className="ml-[70px]">{hotelProfile.trade_name || hotelProfile.legal_name}</span></p>
            <p><strong>ENDERECO</strong><span className="ml-[46px]">{hotelProfile.address || '-'}</span></p>
            <p><strong>TELEFONE</strong><span className="ml-[50px]">{hotelProfile.phone || '-'}</span></p>
            <p><strong>CNPJ</strong><span className="ml-[75px]">{hotelProfile.cnpj || '-'}</span></p>
          </div>
        </section>

        <SectionTitle>Nome dos passageiros / hospedes</SectionTitle>
        <div className="px-2 py-2 text-xs">
          {paxNames.map((name, index) => (
            <p key={`${name}-${index}`} className="font-bold uppercase">{name} <span className="font-normal">- [ LOCALIZADOR: {code} ]</span></p>
          ))}
        </div>

        <SectionTitle>Detalhes da hospedagem</SectionTitle>
        <div className="grid grid-cols-[1fr_250px] gap-5 px-2 py-2 text-xs">
          <div className="space-y-1">
            <p><strong>HOTEL:</strong> {hotelProfile.trade_name || hotelProfile.legal_name}</p>
            <p><strong>ENDERECO:</strong> {hotelProfile.address || '-'}</p>
            <p><strong>TELEFONE:</strong> {hotelProfile.phone || '-'}</p>
            <p><strong>TIPO DE ACOMODACAO:</strong> {reservation.category || '-'} - {OCCUPANCY_LABELS[occupancy] || occupancy}</p>
          </div>
          <div className="space-y-1">
            <p><strong>DATA DE ENTRADA:</strong> {dateBR(reservation.check_in)}</p>
            <p><strong>DATA DE SAIDA:</strong> {dateBR(reservation.check_out)}</p>
            <p><strong>DIARIAS:</strong> {totals.nights}</p>
            <p><strong>OBSERVACAO:</strong> Apresentar no check-in</p>
          </div>
        </div>

        <SectionTitle>Detalhes do receptivo / empresa</SectionTitle>
        <div className="grid grid-cols-3 bg-blue-50 text-xs font-black">
          <div className="px-2 py-1">Empresa</div>
          <div className="px-2 py-1">Centro de custo</div>
          <div className="px-2 py-1">Telefone</div>
        </div>
        <div className="grid grid-cols-3 text-xs">
          <div className="px-2 py-1">{company?.name || '-'}</div>
          <div className="px-2 py-1">{reservation.cost_center || '-'}</div>
          <div className="px-2 py-1">{reservation.contact_phone || company?.phone || '-'}</div>
        </div>

        <SectionTitle>Pagamento autorizado</SectionTitle>
        <div className="grid grid-cols-4 text-xs">
          <div className="px-2 py-1"><strong>Forma:</strong> Faturado</div>
          <div className="px-2 py-1"><strong>Status:</strong> faturamento</div>
          <div className="px-2 py-1"><strong>Cartao:</strong> -</div>
          <div className="px-2 py-1"><strong>Janela:</strong> -</div>
        </div>

        <SectionTitle>Servicos inclusos e valores previstos</SectionTitle>
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
              ['Hospedagem', `${reservation.category || '-'} - ${OCCUPANCY_LABELS[occupancy] || occupancy}`, `${totals.nights} diaria(s)`, money(totals.tariff * totals.nights)],
              ...(totals.iss > 0 ? [['ISS', 'Imposto sobre servico', '1', money(totals.iss)]] : []),
              ...(totals.service > 0 ? [['Taxa', 'Taxa de servico', '1', money(totals.service)]] : []),
              ['Total previsto', 'Sujeito a validacao operacional', '', money(totals.total)],
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

        <SectionTitle>Informacoes para faturamento</SectionTitle>
        <div className="grid grid-cols-2 gap-6 px-2 py-2 text-xs leading-5">
          <div>
            <p className="font-black uppercase">Dados fiscais / nota</p>
            <p className="mt-1 whitespace-pre-line">{reservation.billing_info || 'Utilizar dados cadastrais da empresa/agencia.'}</p>
          </div>
          <div>
            <p className="font-black uppercase">Instrucoes adicionais</p>
            <p className="mt-1 whitespace-pre-line">{reservation.billing_obs || 'Sem observacoes adicionais.'}</p>
          </div>
        </div>

        <footer className="mt-10">
          <div className="border-y border-dashed border-neutral-300 py-2 text-xs font-black uppercase tracking-widest text-neutral-500">Protocolo de entrega do voucher</div>
          <div className="mt-2 grid grid-cols-[1fr_1fr] gap-8 bg-blue-50 p-3 text-xs">
            <div>
              <p><strong>Codigo:</strong> {code}</p>
              <p><strong>Hospede:</strong> {paxNames[0] || reservation.guest_name}</p>
              <p><strong>Entrada:</strong> {dateBR(reservation.check_in)}</p>
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mt-5 border-y border-blue-300 bg-blue-50 px-2 py-1 text-sm font-black uppercase">{children}</div>;
}
