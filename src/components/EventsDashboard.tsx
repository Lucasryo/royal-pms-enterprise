import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserProfile, HotelEvent, Company } from '../types';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  MapPin,
  FileText,
  DollarSign,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Filter,
  MoreVertical,
  X,
  Edit2,
  Printer,
  Download,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, startOfToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EVENT_TYPES = ['Corporativo', 'Social', 'Casamento', 'Batizado', 'Formatura', 'Exposição', 'Outro'];
const HALLS = ['Salão Búzios', 'Salão Rio das Ostras', 'Salão Cabo Frio', 'Sala de Reunião', 'Salão Sétimo Andar', 'Rooftop'];

export default function EventsDashboard({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'register'>('calendar');
  const [events, setEvents] = useState<HotelEvent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingEvent, setViewingEvent] = useState<HotelEvent | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<{ event: HotelEvent; reason: string } | null>(null);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  // Registration form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '08:00',
    end_time: '18:00',
    hall_name: HALLS[0],
    halls: [] as string[],
    event_type: EVENT_TYPES[0],
    attendees_count: 0,
    total_value: 0,
    items_included: '',
    client_profile: '',
    client_category: 'Pessoa física' as HotelEvent['client_category'],
    check_info: '',
    staff_roadmap: '',
    important_notes: '',
    company_id: '',
    status: 'planned' as HotelEvent['status']
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Sync: ensure every active event has an OS number and a linked fatura
      try {
        const { error: syncErr } = await supabase.rpc('sync_faturas');
        if (syncErr) console.warn('sync_faturas rpc error (non-fatal):', syncErr);
      } catch (e) {
        console.warn('sync_faturas failed (non-fatal):', e);
      }

      const { data: eventsData, error: eventsError } = await supabase
        .from('hotel_events')
        .select('*')
        .order('start_date');

      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (eventsError) {
        console.warn("hotel_events error:", eventsError);
        setEvents([]);
      } else {
        setEvents(eventsData || []);
      }

      if (companiesData) setCompanies(companiesData);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const hallsToSave = formData.halls.length > 0 ? formData.halls : [formData.hall_name];
      const savePayload = {
        ...formData,
        halls: hallsToSave,
        hall_name: hallsToSave[0] || formData.hall_name,
        company_id: formData.company_id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('hotel_events')
          .update(savePayload)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Evento atualizado com sucesso!');
        setEditingId(null);
      } else {
        const osNumber = `OS-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const newEvent = {
          ...savePayload,
          os_number: osNumber,
          created_at: new Date().toISOString(),
          created_by: profile.id
        };

        const { error } = await supabase.from('hotel_events').insert([newEvent]);

        if (error) throw error;

        // Create fatura/OS in Faturas & Arquivos
        const { error: faturaError } = await supabase.from('files').insert([{
          type: 'Fatura Evento',
          category: 'Fatura Evento',
          original_name: `OS ${osNumber} - ${newEvent.name}`,
          storage_path: `eventos/${osNumber}`,
          amount: newEvent.total_value,
          period: format(new Date(newEvent.start_date), 'yyyy-MM'),
          due_date: newEvent.start_date,
          status: 'PENDING',
          upload_date: new Date().toISOString(),
          uploader_id: profile.id,
          company_id: newEvent.company_id || null,
          event_os_number: osNumber,
          reservation_code: osNumber,
        }]);
        if (faturaError) {
          console.error('Erro ao criar fatura do evento:', faturaError);
          toast.warning('Evento criado, mas houve falha ao gerar a fatura. Verifique em Faturas & Arquivos.');
        } else {
          toast.success('Evento cadastrado e O.S. gerada com sucesso!');
        }
      }

      setFormData({
        name: '',
        description: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '08:00',
        end_time: '18:00',
        hall_name: HALLS[0],
        halls: [],
        event_type: EVENT_TYPES[0],
        attendees_count: 0,
        total_value: 0,
        items_included: '',
        client_profile: '',
        client_category: 'Pessoa física',
        check_info: '',
        staff_roadmap: '',
        important_notes: '',
        company_id: '',
        status: 'planned'
      });
      setActiveTab('calendar');
      fetchData();
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error('Erro ao salvar evento.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: HotelEvent) => {
    const halls = event.halls && event.halls.length > 0
      ? event.halls
      : event.hall_name ? [event.hall_name] : [];
    setFormData({
      name: event.name,
      description: event.description || '',
      start_date: event.start_date,
      end_date: event.end_date,
      start_time: event.start_time || '08:00',
      end_time: event.end_time || '18:00',
      hall_name: event.hall_name,
      halls,
      event_type: event.event_type,
      attendees_count: event.attendees_count,
      total_value: event.total_value,
      items_included: event.items_included || '',
      client_profile: event.client_profile || '',
      client_category: event.client_category || 'Pessoa física',
      check_info: event.check_info || '',
      staff_roadmap: event.staff_roadmap || '',
      important_notes: event.important_notes || '',
      company_id: event.company_id || '',
      status: event.status
    });
    setEditingId(event.id);
    setActiveTab('register');
    setViewingEvent(null);
  };

  const handleCancel = (event: HotelEvent) => {
    setCancelModal({ event, reason: '' });
  };

  const confirmCancel = async () => {
    if (!cancelModal) return;
    const { event, reason } = cancelModal;
    if (!reason.trim()) {
      toast.error('É necessário informar um motivo para o cancelamento.');
      return;
    }
    setCancelModal(null);
    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('cancel_event', {
        p_event_id: event.id,
        p_reason: reason,
      });
      if (rpcError) throw rpcError;

      toast.success('Evento e fatura cancelados com sucesso!');
      setViewingEvent(null);
      fetchData();
    } catch (error: any) {
      console.error('Error cancelling event:', error);
      const msg = error?.message || String(error);
      if (msg.includes('no column') || msg.includes('no such column')) {
        toast.error('Banco de dados desatualizado. Reinicie o servidor.');
      } else if (msg.includes('não encontrado') || msg.includes('404')) {
        toast.error('Evento não encontrado no banco de dados.');
      } else {
        toast.error(`Erro ao cancelar: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadContract = async (event: HotelEvent) => {
    const element = document.getElementById('contract-pdf-template');
    if (!element) {
      toast.error('Template para PDF não encontrado.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Gerando PDF do contrato...');

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`CONTRATO_${event.os_number || 'EVENTO'}.pdf`);

      toast.success('Contrato em PDF gerado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Falha ao gerar o PDF. Tente novamente.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const nextMonth = () => setCurrentMonth(addDays(endOfMonth(currentMonth), 1));
  const prevMonth = () => setCurrentMonth(addDays(startOfMonth(currentMonth), -1));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Gestão de Eventos</h1>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1">Planejamento • Reservas de Salão • O.S.</p>
        </div>

        <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            Calendário
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'register' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            Novo Evento / O.S.
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-gray-900 capitalize">
                    {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-2 hover:bg-neutral-50 rounded-lg transition-colors border border-neutral-100"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={nextMonth} className="p-2 hover:bg-neutral-50 rounded-lg transition-colors border border-neutral-100"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Confirmado</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Planejado</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-100">
                    <div className="w-2 h-2 bg-neutral-400 rounded-full" />
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Cancelado</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-px bg-neutral-200 rounded-2xl overflow-hidden border border-neutral-200">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(day => (
                  <div key={day} className="bg-neutral-50 p-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{day}</p>
                  </div>
                ))}

                {/* Pad empty days at start of month */}
                {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white p-4 h-32 opacity-50" />
                ))}

                {days.map(day => {
                  const dayEvents = events.filter(e => isSameDay(parseISO(e.start_date), day));
                  return (
                    <div key={day.toString()} className={`bg-white p-4 h-32 border-t border-r last:border-r-0 border-neutral-100 hover:bg-neutral-50 transition-colors group relative ${isToday(day) ? 'bg-blue-50/30' : ''}`}>
                      <span className={`text-sm font-black ${isToday(day) ? 'text-blue-600 bg-blue-100 w-8 h-8 flex items-center justify-center rounded-full -ml-1 -mt-1' : 'text-neutral-400'}`}>
                        {format(day, 'd')}
                      </span>

                      <div className="mt-2 space-y-1">
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => setViewingEvent(event)}
                            className={`w-full text-left p-1.5 rounded-lg text-[9px] font-bold truncate transition-all flex items-center gap-1.5 ${
                              event.status === 'cancelled'
                                ? 'bg-neutral-100 text-neutral-400 border border-neutral-200 line-through'
                                : event.status === 'confirmed'
                                  ? 'bg-green-50 text-green-700 border border-green-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.status === 'cancelled' ? 'bg-neutral-400' : event.status === 'confirmed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            {event.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event List Card */}
            <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
               <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <Clock className="w-5 h-5 text-primary" />
                 Próximos Eventos
               </h3>
               <div className="space-y-4">
                  {events.length > 0 ? (
                    events.map(event => (
                      <div key={event.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all group ${event.status === 'cancelled' ? 'bg-neutral-50 border-neutral-200 opacity-60' : 'bg-neutral-50 border-neutral-100 hover:border-primary'}`}>
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-white border border-neutral-200 flex flex-col items-center justify-center">
                              <span className="text-[10px] font-black uppercase text-neutral-400 leading-none mb-0.5">{format(parseISO(event.start_date), 'MMM', { locale: ptBR })}</span>
                              <span className="text-lg font-black text-neutral-900 leading-none">{format(parseISO(event.start_date), 'dd')}</span>
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`font-black ${event.status === 'cancelled' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{event.name}</h4>
                                {event.status === 'cancelled' && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-500 text-[9px] font-black uppercase rounded-full">Cancelado</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                 <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 uppercase">
                                    <MapPin className="w-3 h-3 text-neutral-400" />
                                    {event.halls && event.halls.length > 0 ? event.halls.join(' · ') : event.hall_name}
                                 </span>
                                 <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 uppercase">
                                    <Users className="w-3 h-3 text-neutral-400" />
                                    {event.attendees_count} pessoas
                                 </span>
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-neutral-400 mb-0.5">O.S. Numero</p>
                              <p className="text-xs font-bold text-neutral-900">{event.os_number}</p>
                           </div>
                           <button
                            onClick={() => setViewingEvent(event)}
                            className="p-3 bg-white hover:bg-neutral-900 hover:text-white rounded-xl border border-neutral-200 transition-all shadow-sm"
                           >
                              <ArrowRight className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                       <p className="text-neutral-400 font-bold italic">Nenhum evento registrado no momento.</p>
                    </div>
                  )}
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start"
          >
            {/* Form */}
            <div className="xl:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Nome do Evento</label>
                       <input
                         required
                         value={formData.name}
                         onChange={e => setFormData({...formData, name: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary/10 outline-none font-bold"
                         placeholder="Ex: Workshop de Liderança"
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-2 block ml-1">
                         Salões
                         {formData.halls.length > 0 && (
                           <span className="ml-2 text-amber-700 normal-case tracking-normal font-bold">
                             ({formData.halls.length} selecionado{formData.halls.length > 1 ? 's' : ''})
                           </span>
                         )}
                       </label>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                         {HALLS.map(h => {
                           const selected = formData.halls.includes(h);
                           return (
                             <button
                               key={h}
                               type="button"
                               onClick={() => {
                                 const next = selected
                                   ? formData.halls.filter(x => x !== h)
                                   : [...formData.halls, h];
                                 setFormData({ ...formData, halls: next });
                               }}
                               className={`px-3 py-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                                 selected
                                   ? 'bg-amber-700 border-amber-700 text-white shadow-sm'
                                   : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300'
                               }`}
                             >
                               {h}
                             </button>
                           );
                         })}
                       </div>
                       {formData.halls.length === 0 && (
                         <p className="text-[10px] text-red-400 mt-1 ml-1">Selecione ao menos um salão</p>
                       )}
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Tipo de Evento</label>
                       <select
                         value={formData.event_type}
                         onChange={e => setFormData({...formData, event_type: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Data de Início</label>
                       <input
                         type="date"
                         required
                         value={formData.start_date}
                         onChange={e => setFormData({...formData, start_date: e.target.value, end_date: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Início</label>
                          <input
                            type="time"
                            value={formData.start_time}
                            onChange={e => setFormData({...formData, start_time: e.target.value})}
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                          />
                       </div>
                       <div>
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Fim</label>
                          <input
                            type="time"
                            value={formData.end_time}
                            onChange={e => setFormData({...formData, end_time: e.target.value})}
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Número de Participantes</label>
                       <div className="relative">
                          <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            type="number"
                            required
                            value={formData.attendees_count}
                            onChange={e => setFormData({...formData, attendees_count: parseInt(e.target.value)})}
                            className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                            placeholder="0"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Valor do Contrato (R$)</label>
                       <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            type="number"
                            required
                            value={formData.total_value}
                            onChange={e => setFormData({...formData, total_value: parseFloat(e.target.value)})}
                            className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                            placeholder="0,00"
                          />
                       </div>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Perfil do Contratante</label>
                       <select
                         value={formData.client_category}
                         onChange={e => setFormData({...formData, client_category: e.target.value as any})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         <option value="Pessoa física">Pessoa física</option>
                         <option value="Empresa">Empresa</option>
                         <option value="Agência">Agência</option>
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Perfil do Evento / Cliente</label>
                       <input
                         value={formData.client_profile}
                         onChange={e => setFormData({...formData, client_profile: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                         placeholder="Ex: Noivos em pré-casamento"
                       />
                    </div>

                    <div>
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Observações de Check-in/out</label>
                       <input
                         value={formData.check_info}
                         onChange={e => setFormData({...formData, check_info: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                         placeholder="Ex: Check-in sexta / Check-out sábado"
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Observações Importantes (Bullet points)</label>
                       <textarea
                         value={formData.important_notes}
                         onChange={e => setFormData({...formData, important_notes: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-24"
                         placeholder="• Item 1&#10;• Item 2"
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Passo-a-passo para Colaboradores (Cronograma)</label>
                       <textarea
                         value={formData.staff_roadmap}
                         onChange={e => setFormData({...formData, staff_roadmap: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-48"
                         placeholder="Dia 14/09/2025&#10;Recepção VIP&#10;- Hospedagem: Descrição...&#10;- Brinde: Descrição..."
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Itens Inclusos (Separe por vírgula)</label>
                       <textarea
                         value={formData.items_included}
                         onChange={e => setFormData({...formData, items_included: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold h-24"
                         placeholder="Ex: Projetor, Coffee Break, Welcome Drink..."
                       />
                    </div>

                    <div className="md:col-span-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block ml-1">Empresa Contratante</label>
                       <select
                         value={formData.company_id}
                         onChange={e => setFormData({...formData, company_id: e.target.value})}
                         className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-bold"
                       >
                         <option value="">Particular / Pessoa Física</option>
                         {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                       </select>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-neutral-100 flex justify-end">
                     <button
                       type="submit"
                       disabled={loading}
                       className="px-8 py-3 bg-neutral-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-neutral-800 transition-all flex items-center gap-2 shadow-lg shadow-neutral-900/10"
                     >
                       {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                         <>
                           <CheckCircle2 className="w-4 h-4" />
                           Cadastrar Evento & Gerar O.S.
                         </>
                       )}
                     </button>
                  </div>
                </form>
               </div>
            </div>

            {/* O.S. Live Preview */}
            <div className="xl:col-span-7 space-y-6">
               <div className="bg-paper rounded-[2rem] border border-ink/10 shadow-[0_20px_60px_-15px_rgba(20,15,10,0.12)] sticky top-24 overflow-hidden p-8">

                  <div>
                     <div className="flex items-center justify-between mb-7">
                        <div>
                           <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Pré-visualização da O.S.</p>
                           <p className="font-display text-lg font-light text-ink mt-0.5">Ordem de Serviço — Formato A4</p>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400 px-3 py-1.5 bg-ink/5 rounded-full">{formData.client_category}</span>
                           <button
                             onClick={async () => {
                               const el = document.getElementById('contract-pdf-template');
                               if (!el) return;
                               const { default: html2canvas } = await import('html2canvas');
                               const { default: jsPDF } = await import('jspdf');
                               const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#FAF8F2' });
                               const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                               const props = pdf.getImageProperties(canvas.toDataURL('image/png'));
                               const w = pdf.internal.pageSize.getWidth();
                               pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (props.height * w) / props.width);
                               pdf.save(`OS_PREVIEW_${format(new Date(), 'ddMMyyyy')}.pdf`);
                             }}
                             className="group flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink/50 hover:bg-ink hover:text-paper transition-all"
                             title="Gerar PDF da O.S."
                           >
                             <Printer className="w-4 h-4" />
                           </button>
                        </div>
                     </div>

                     {/* ── A4 Live Preview ── */}
                     <div className="mx-auto max-w-[794px] overflow-y-auto" style={{ fontFamily: 'Georgia, serif', backgroundColor: '#FAF8F2', color: '#1E1912', boxShadow: '0 4px 32px rgba(20,15,10,0.10), 0 0 0 1px rgba(20,15,10,0.06)' }}>

                       {/* HEADER */}
                       <div style={{ borderBottom: '1px solid rgba(30,25,18,0.08)' }}>
                         <div style={{ height: '2px', background: 'linear-gradient(to right, #C49A3C, #b45309)' }} />
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '28px 48px 22px' }}>
                           <div>
                             <div style={{ fontSize: '20px', fontWeight: '300', letterSpacing: '0.26em', textTransform: 'uppercase', color: '#1E1912', lineHeight: 1 }}>Royal Macaé</div>
                             <div style={{ fontSize: '7.5px', color: '#78716c', letterSpacing: '0.65em', fontWeight: '500', textTransform: 'uppercase', marginTop: '5px', fontFamily: 'Inter, sans-serif' }}>Palace  ·  Hotel</div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
                               <div style={{ height: '1px', width: '20px', background: '#C49A3C' }} />
                               <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#C49A3C' }} />
                               <div style={{ height: '1px', width: '20px', background: '#C49A3C' }} />
                             </div>
                           </div>
                           <div style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif' }}>
                             <div style={{ fontSize: '7px', letterSpacing: '0.52em', color: '#78716c', textTransform: 'uppercase', marginBottom: '4px' }}>Ordem de Serviço</div>
                             <div style={{ fontSize: '17px', fontWeight: '300', color: '#C49A3C', letterSpacing: '0.06em', fontFamily: 'Georgia, serif' }}>— pendente —</div>
                             <div style={{ fontSize: '9px', color: '#78716c', marginTop: '4px' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                             <div style={{ fontSize: '8px', color: '#a8a29e', marginTop: '1px' }}>(22) 2123-9650 · eventos@royalmacae.com.br</div>
                           </div>
                         </div>
                       </div>

                       {/* EVENT NAME */}
                       <div style={{ padding: '26px 48px 22px', borderBottom: '1px solid rgba(30,25,18,0.07)' }}>
                         <div style={{ fontSize: '7px', letterSpacing: '0.48em', color: '#78716c', textTransform: 'uppercase', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>· Nome do Evento</div>
                         <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                           <div style={{ flex: 1 }}>
                             <div style={{ fontSize: '26px', fontWeight: '300', color: '#1E1912', letterSpacing: '-0.01em', lineHeight: '1.1' }}>{formData.name || '—'}</div>
                           </div>
                           <div style={{ padding: '4px 14px', background: 'rgba(196,154,60,0.10)', border: '1px solid rgba(196,154,60,0.28)', borderRadius: '999px', fontSize: '8px', color: '#C49A3C', letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: '6px', fontFamily: 'Inter, sans-serif' }}>{formData.event_type}</div>
                         </div>
                       </div>

                       {/* INFO GRID */}
                       <div style={{ padding: '22px 48px', backgroundColor: '#F5F2EC' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', fontFamily: 'Inter, sans-serif' }}>
                           <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                           <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Detalhes do evento</div>
                           <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.2)' }} />
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(30,25,18,0.07)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(30,25,18,0.07)' }}>
                           {[
                             { label: 'Contratante', value: formData.client_category || '—' },
                             { label: 'Tipo de Evento', value: formData.event_type || '—' },
                             { label: 'Local / Salão', value: formData.halls.length > 0 ? formData.halls.join(' · ') : formData.hall_name || '—' },
                             { label: 'Data de Início', value: formData.start_date ? format(parseISO(formData.start_date), 'dd/MM/yyyy') : '—' },
                             { label: 'Data de Término', value: formData.end_date ? format(parseISO(formData.end_date), 'dd/MM/yyyy') : '—' },
                             { label: 'Horário', value: formData.start_time && formData.end_time ? `${formData.start_time} – ${formData.end_time}` : '—' },
                             { label: 'Participantes', value: formData.attendees_count ? `${formData.attendees_count} pessoas` : '—' },
                             { label: 'Perfil do Contratante', value: formData.client_profile || '—' },
                             { label: 'Valor do Contrato', value: formData.total_value ? formData.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—' },
                           ].map((f, i) => (
                             <div key={i} style={{ padding: '13px 16px', backgroundColor: i % 2 === 0 ? '#F5F2EC' : '#FAF8F2', fontFamily: 'Inter, sans-serif' }}>
                               <div style={{ fontSize: '7px', letterSpacing: '0.3em', color: '#78716c', marginBottom: '5px', textTransform: 'uppercase' }}>{f.label}</div>
                               <div style={{ fontSize: '12px', fontWeight: '500', color: '#1E1912' }}>{f.value}</div>
                             </div>
                           ))}
                         </div>
                       </div>

                       {/* SERVICES */}
                       {formData.items_included && (
                         <div style={{ padding: '18px 48px 20px', backgroundColor: '#FAF8F2', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                             <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                             <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Serviços & itens inclusos</div>
                             <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.2)' }} />
                           </div>
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                             {formData.items_included.split(',').map((item, i) => item.trim() && (
                               <span key={i} style={{ padding: '4px 13px', fontSize: '8px', border: '1px solid rgba(196,154,60,0.28)', color: '#C49A3C', backgroundColor: 'rgba(196,154,60,0.07)', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}>{item.trim()}</span>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* IMPORTANT NOTES */}
                       {formData.important_notes && (
                         <div style={{ padding: '18px 48px 20px', backgroundColor: '#F5F2EC', borderTop: '1px solid rgba(196,154,60,0.15)' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                             <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                             <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Observações importantes</div>
                             <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.2)' }} />
                           </div>
                           <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(196,154,60,0.4)', fontSize: '10px', color: '#3d3529', lineHeight: '1.9', whiteSpace: 'pre-line', fontStyle: 'italic' }}>{formData.important_notes}</div>
                         </div>
                       )}

                       {/* STAFF ROADMAP */}
                       <div style={{ padding: '18px 48px 20px', backgroundColor: '#FAF8F2', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                           <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                           <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Passo a passo — Equipe</div>
                           <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.2)' }} />
                         </div>
                         <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(196,154,60,0.25)', fontSize: '10px', color: '#3d3529', lineHeight: '1.9', whiteSpace: 'pre-line' }}>{formData.staff_roadmap || 'Nenhum cronograma definido.'}</div>
                       </div>

                       {/* SIGNATURE */}
                       <div style={{ padding: '28px 48px 24px', backgroundColor: '#F5F2EC', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                           {['Responsável pelo Evento', 'Contratante'].map((label) => (
                             <div key={label}>
                               <div style={{ height: '44px', borderBottom: '1px solid rgba(196,154,60,0.5)', marginBottom: '10px', position: 'relative' }}>
                                 <div style={{ position: 'absolute', bottom: '-3px', left: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#C49A3C' }} />
                                 <div style={{ position: 'absolute', bottom: '-3px', right: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#C49A3C' }} />
                               </div>
                               <div style={{ fontSize: '8px', letterSpacing: '0.24em', color: '#78716c', textTransform: 'uppercase', marginBottom: '4px', fontFamily: 'Inter, sans-serif' }}>{label}</div>
                               <div style={{ fontSize: '8px', color: '#a8a29e', fontFamily: 'Inter, sans-serif' }}>Data: ____/____/________</div>
                             </div>
                           ))}
                         </div>
                       </div>

                       {/* FOOTER */}
                       <div style={{ background: '#F5F2EC', padding: '12px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #C49A3C' }}>
                         <div style={{ fontSize: '8px', letterSpacing: '0.52em', color: '#78716c', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}>Royal Macaé Palace</div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                           <div style={{ height: '1px', width: '14px', background: '#C49A3C' }} />
                           <span style={{ fontSize: '8px', color: '#78716c', fontStyle: 'italic', letterSpacing: '0.18em', fontFamily: 'Georgia, serif' }}>Excelência em cada detalhe</span>
                           <div style={{ height: '1px', width: '14px', background: '#C49A3C' }} />
                         </div>
                       </div>

                     </div>
                     {/* end A4 preview */}

                     <p className="text-[11px] text-stone-400 font-light mt-6 italic text-center">
                       Ao salvar, o valor de{' '}
                       <span className="font-display text-gold not-italic">{formData.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                       {' '}será provisionado no faturamento para a data de início do evento.
                     </p>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Details Modal */}
      <AnimatePresence>
        {viewingEvent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="bg-paper w-full max-w-3xl rounded-[2rem] shadow-[0_40px_100px_-20px_rgba(20,15,10,0.45)] overflow-hidden max-h-[92vh] flex flex-col"
            >
              {/* ── Header ── */}
              <div className="relative bg-ink px-10 pt-10 pb-8 text-paper overflow-hidden shrink-0">
                <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-gold/10 blur-2xl" />
                <button
                  onClick={() => setViewingEvent(null)}
                  className="absolute top-6 right-6 flex h-9 w-9 items-center justify-center rounded-full border border-paper/15 text-paper/60 hover:bg-paper/10 hover:text-paper transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="relative">
                  <div className="flex items-center gap-4 mb-5">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-paper/40">· {viewingEvent.os_number}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.16em] ${
                      viewingEvent.status === 'confirmed' ? 'bg-moss/25 text-moss'
                      : viewingEvent.status === 'cancelled' ? 'bg-red-500/20 text-red-300'
                      : 'bg-gold/20 text-gold'
                    }`}>
                      {viewingEvent.status === 'confirmed' ? 'Confirmado' : viewingEvent.status === 'cancelled' ? 'Cancelado' : 'Planejado'}
                    </span>
                  </div>
                  <h2 className="font-display text-4xl font-light tracking-[-0.02em] text-paper leading-tight">
                    {viewingEvent.name}
                  </h2>
                  <p className="mt-1.5 text-[11px] uppercase tracking-[0.22em] text-paper/40">{viewingEvent.event_type}</p>
                  <div className="flex flex-wrap items-center gap-6 mt-7 pt-6 border-t border-paper/10 text-sm text-paper/60">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-3.5 h-3.5 text-gold/70" />
                      <span>{format(parseISO(viewingEvent.start_date), 'dd MMMM yyyy', { locale: ptBR })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-gold/70" />
                      <span>{viewingEvent.start_time} – {viewingEvent.end_time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gold/70" />
                      <span>
                        {viewingEvent.halls && viewingEvent.halls.length > 0
                          ? viewingEvent.halls.join(' · ')
                          : viewingEvent.hall_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-gold/70" />
                      <span>{viewingEvent.attendees_count} pessoas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="overflow-y-auto flex-1">
                <div className="px-10 py-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Contract details */}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-5">· Detalhes do contrato</p>
                      <dl className="divide-y divide-ink/[0.06]">
                        {[
                          { label: 'Contratante', value: viewingEvent.client_category || '—' },
                          { label: 'Perfil', value: viewingEvent.client_profile || '—' },
                          { label: 'Participantes', value: `${viewingEvent.attendees_count} pessoas` },
                          { label: 'Valor do contrato', value: viewingEvent.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), highlight: true },
                          { label: 'Check / período', value: viewingEvent.check_info || '—' },
                        ].map(({ label, value, highlight }) => (
                          <div key={label} className="flex items-baseline justify-between py-3 gap-4">
                            <dt className="text-[11px] uppercase tracking-[0.18em] text-stone-500 shrink-0">{label}</dt>
                            <dd className={`text-sm text-right ${highlight ? 'font-display text-base font-light text-gold' : 'font-medium text-ink'}`}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {/* Staff roadmap */}
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-5">· Cronograma da equipe</p>
                      <div className="border-l-2 border-gold/30 pl-4 max-h-64 overflow-y-auto">
                        <p className="text-sm leading-relaxed text-ink/70 whitespace-pre-line font-light">
                          {viewingEvent.staff_roadmap || <span className="italic text-stone-400">Nenhum cronograma registrado.</span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  {viewingEvent.items_included && (
                    <div className="pt-6 border-t border-ink/[0.07]">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-4">· Serviços & itens inclusos</p>
                      <div className="flex flex-wrap gap-2">
                        {viewingEvent.items_included.split(',').map((item, i) => item.trim() && (
                          <span key={i} className="px-3 py-1.5 rounded-full border border-gold/25 bg-gold/[0.06] text-[11px] tracking-[0.12em] uppercase text-ink/65 font-medium">
                            {item.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewingEvent.important_notes && (
                    <div className="pt-6 border-t border-ink/[0.07]">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-4">· Observações importantes</p>
                      <div className="border-l-2 border-gold/40 pl-5 py-1">
                        <p className="text-sm leading-relaxed text-ink/70 italic whitespace-pre-line font-display font-light">
                          {viewingEvent.important_notes}
                        </p>
                      </div>
                    </div>
                  )}

                  {viewingEvent.status === 'cancelled' && viewingEvent.cancel_reason && (
                    <div className="pt-6 border-t border-ink/[0.07]">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-red-500/70 mb-2">· Motivo do cancelamento</p>
                      <p className="text-sm text-ink/65">{viewingEvent.cancel_reason}</p>
                      {viewingEvent.cancelled_at && (
                        <p className="text-[11px] text-stone-400 mt-1">{new Date(viewingEvent.cancelled_at).toLocaleString('pt-BR')}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="px-10 py-6 border-t border-ink/10 flex items-center justify-between shrink-0 no-print">
                <div className="flex gap-2">
                  {viewingEvent.status !== 'cancelled' && (
                    <button
                      onClick={() => handleEdit(viewingEvent)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/15 text-sm text-ink/65 hover:border-ink/30 hover:text-ink transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )}
                  {viewingEvent.status !== 'cancelled' && (profile.role === 'admin' || profile.permissions?.canCancelEvents) && (
                    <button
                      onClick={() => handleCancel(viewingEvent)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-red-200/70 text-sm text-red-500/70 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadContract(viewingEvent)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/15 text-sm text-ink/65 hover:border-ink/30 hover:text-ink transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir
                  </button>
                </div>
                <button
                  onClick={() => handleDownloadContract(viewingEvent)}
                  className="group inline-flex items-center gap-3 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-all hover:bg-ink/90"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar O.S. em PDF
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden PDF Template - rendered off-screen for html2canvas */}
      {(viewingEvent || (activeTab === 'register' && formData.name)) && (() => {
        const d = viewingEvent || formData as any;
        const infoRows = [
          ['Contratante', d.client_category || '—'],
          ['Tipo de Evento', d.event_type || '—'],
          ['Local / Salão', (d.halls && d.halls.length > 0) ? d.halls.join(' · ') : (d.hall_name || '—')],
          ['Data de Início', d.start_date ? format(parseISO(d.start_date), 'dd/MM/yyyy') : '—'],
          ['Data de Término', d.end_date ? format(parseISO(d.end_date), 'dd/MM/yyyy') : '—'],
          ['Horário', (d.start_time && d.end_time) ? `${d.start_time} – ${d.end_time}` : '—'],
          ['Participantes', d.attendees_count ? `${d.attendees_count} pessoas` : '—'],
          ['Perfil', d.client_profile || '—'],
          ['Valor do Contrato', d.total_value ? Number(d.total_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'],
        ];
        return (
          <div className="fixed -left-[9999px] top-0 overflow-hidden pointer-events-none">
            <div id="contract-pdf-template" style={{ backgroundColor: '#FAF8F2', color: '#1E1912', fontFamily: 'Georgia, "Times New Roman", serif', width: '794px', minHeight: '1123px' }}>

              {/* HEADER */}
              <div style={{ borderBottom: '1px solid rgba(30,25,18,0.08)' }}>
                <div style={{ height: '2px', background: 'linear-gradient(to right, #C49A3C, #b45309)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '30px 48px 24px' }}>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: '300', letterSpacing: '0.26em', textTransform: 'uppercase', color: '#1E1912', lineHeight: 1, margin: 0, fontFamily: 'Georgia, serif' }}>Royal Macaé</div>
                    <div style={{ fontSize: '7.5px', color: '#78716c', letterSpacing: '0.65em', fontWeight: '500', textTransform: 'uppercase', marginTop: '6px', fontFamily: 'Arial, sans-serif' }}>Palace  ·  Hotel</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '11px' }}>
                      <div style={{ height: '1px', width: '20px', background: '#C49A3C' }} />
                      <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#C49A3C' }} />
                      <div style={{ height: '1px', width: '20px', background: '#C49A3C' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ fontSize: '7px', letterSpacing: '0.52em', color: '#78716c', textTransform: 'uppercase', marginBottom: '4px' }}>Ordem de Serviço</div>
                    <div style={{ fontSize: '16px', fontWeight: '300', color: '#C49A3C', letterSpacing: '0.06em', margin: 0, fontFamily: 'Georgia, serif' }}>{d.os_number || '— pendente —'}</div>
                    <div style={{ fontSize: '9px', color: '#78716c', marginTop: '4px' }}>{format(new Date(), 'dd/MM/yyyy')}</div>
                    <div style={{ fontSize: '8px', color: '#a8a29e', marginTop: '2px' }}>(22) 2123-9650 · eventos@royalmacae.com.br</div>
                  </div>
                </div>
              </div>

              {/* EVENT NAME */}
              <div style={{ padding: '26px 48px 22px', borderBottom: '1px solid rgba(30,25,18,0.07)' }}>
                <div style={{ fontSize: '7px', letterSpacing: '0.48em', color: '#78716c', textTransform: 'uppercase', marginBottom: '10px', fontFamily: 'Arial, sans-serif' }}>· Nome do Evento</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '26px', fontWeight: '300', color: '#1E1912', letterSpacing: '-0.01em', lineHeight: '1.1', margin: 0, fontFamily: 'Georgia, serif' }}>{d.name || '—'}</div>
                  </div>
                  <div style={{ padding: '4px 14px', background: 'rgba(196,154,60,0.10)', border: '1px solid rgba(196,154,60,0.3)', borderRadius: '999px', fontSize: '8px', color: '#C49A3C', letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: '6px', fontFamily: 'Arial, sans-serif' }}>{d.event_type || '—'}</div>
                </div>
              </div>

              {/* INFO GRID */}
              <div style={{ padding: '22px 48px', backgroundColor: '#F5F2EC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', fontFamily: 'Arial, sans-serif' }}>
                  <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                  <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Detalhes do evento</div>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.22)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(30,25,18,0.07)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(30,25,18,0.07)' }}>
                  {infoRows.map(([label, value], i) => (
                    <div key={i} style={{ padding: '14px 16px', backgroundColor: i % 2 === 0 ? '#F5F2EC' : '#FAF8F2', fontFamily: 'Arial, sans-serif' }}>
                      <div style={{ fontSize: '7px', letterSpacing: '0.3em', color: '#78716c', marginBottom: '5px', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: '12px', fontWeight: '500', color: '#1E1912', margin: 0 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SERVICES */}
              {d.items_included && (
                <div style={{ padding: '18px 48px 20px', backgroundColor: '#FAF8F2', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                    <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Serviços & itens inclusos</div>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.22)' }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {d.items_included.split(',').map((item: string, i: number) => item.trim() && (
                      <span key={i} style={{ padding: '4px 13px', fontSize: '8px', border: '1px solid rgba(196,154,60,0.3)', color: '#C49A3C', backgroundColor: 'rgba(196,154,60,0.08)', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Arial, sans-serif' }}>{item.trim()}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* IMPORTANT NOTES */}
              {d.important_notes && (
                <div style={{ padding: '18px 48px 20px', backgroundColor: '#F5F2EC', borderTop: '1px solid rgba(196,154,60,0.15)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Arial, sans-serif' }}>
                    <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                    <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Observações importantes</div>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.22)' }} />
                  </div>
                  <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(196,154,60,0.4)', fontSize: '10px', color: '#3d3529', lineHeight: '1.9', whiteSpace: 'pre-line', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{d.important_notes}</div>
                </div>
              )}

              {/* STAFF ROADMAP */}
              <div style={{ padding: '18px 48px 20px', backgroundColor: '#FAF8F2', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontFamily: 'Arial, sans-serif' }}>
                  <div style={{ height: '1px', width: '16px', background: '#C49A3C' }} />
                  <div style={{ fontSize: '7px', letterSpacing: '0.45em', color: '#C49A3C', textTransform: 'uppercase' }}>· Passo a passo — Equipe</div>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(196,154,60,0.22)' }} />
                </div>
                <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(196,154,60,0.28)', fontSize: '10px', color: '#3d3529', lineHeight: '1.9', whiteSpace: 'pre-line', fontFamily: 'Arial, sans-serif' }}>{d.staff_roadmap || 'Nenhum cronograma definido.'}</div>
              </div>

              {/* SIGNATURE */}
              <div style={{ padding: '28px 48px 24px', backgroundColor: '#F5F2EC', borderTop: '1px solid rgba(30,25,18,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                  {['Responsável pelo Evento', 'Contratante'].map((label) => (
                    <div key={label}>
                      <div style={{ height: '46px', borderBottom: '1px solid rgba(196,154,60,0.5)', marginBottom: '10px', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: '-3px', left: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#C49A3C' }} />
                        <div style={{ position: 'absolute', bottom: '-3px', right: 0, width: '5px', height: '5px', borderRadius: '50%', background: '#C49A3C' }} />
                      </div>
                      <div style={{ fontSize: '8px', letterSpacing: '0.24em', color: '#78716c', textTransform: 'uppercase', marginBottom: '4px', fontFamily: 'Arial, sans-serif' }}>{label}</div>
                      <div style={{ fontSize: '8px', color: '#a8a29e', margin: 0, fontFamily: 'Arial, sans-serif' }}>Data: ____/____/________</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FOOTER */}
              <div style={{ background: '#F5F2EC', padding: '13px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #C49A3C' }}>
                <div style={{ fontSize: '8px', letterSpacing: '0.52em', color: '#78716c', textTransform: 'uppercase', margin: 0, fontFamily: 'Arial, sans-serif' }}>Royal Macaé Palace</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <div style={{ height: '1px', width: '14px', background: '#C49A3C' }} />
                  <span style={{ fontSize: '8px', color: '#78716c', fontStyle: 'italic', letterSpacing: '0.18em', fontFamily: 'Georgia, serif' }}>Excelência em cada detalhe</span>
                  <div style={{ height: '1px', width: '14px', background: '#C49A3C' }} />
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Cancel Event Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">Cancelar Evento</h3>
              <p className="text-sm text-neutral-500 mt-1">{cancelModal.event.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">Motivo do Cancelamento</label>
                <textarea
                  autoFocus
                  rows={3}
                  value={cancelModal.reason}
                  onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
                  placeholder="Informe o motivo..."
                  className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelModal(null)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
                >
                  Voltar
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={!cancelModal.reason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-40"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
