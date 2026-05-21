import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MapPin,
  Menu,
  Phone,
  PlayCircle,
  Send,
  Utensils,
  Waves,
  Wifi,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import Login from './Login';
import PublicBookingEngine from './PublicBookingEngine';

const HOTEL_WHATSAPP = '5522997142335';
const HOTEL_PHONE = '(22) 2123-9650';
const HOTEL_EMAIL = 'reservas@royalmacae.com.br';
const HOTEL_ADDRESS = 'Avenida Atlântica, 1642 - Cavaleiros, Macaé - RJ';
const MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Avenida%20Atlantica%201642%20Cavaleiros%20Macae%20RJ';

const fallbackMedia = {
  hero: '/hotel/hero.jpg',
  facade: '/hotel/fachada.jpg',
  lobby: '/hotel/recepcao-instagram.jpg',
  room: '/hotel/detalhes.jpg',
  suite: '/hotel/piscina-noite.jpg',
  restaurant: '/hotel/gastronomia-instagram.jpg',
  pool: '/hotel/piscina-instagram.jpg',
  event: '/hotel/eventos-salao.jpg',
  detail: '/hotel/detalhes.jpg',
};

const navLinks = [
  { href: '#experiencia', label: 'Hotel' },
  { href: '#acomodacoes', label: 'Acomodações' },
  { href: '#reservas', label: 'Reservas' },
  { href: '#eventos', label: 'Eventos' },
  { href: '#contato', label: 'Contato' },
];

const highlights = [
  { value: '202', label: 'quartos e suítes' },
  { value: '1000m²', label: 'para eventos' },
  { value: '6', label: 'salões moduláveis' },
  { value: '24h', label: 'room service' },
];

const amenities = [
  { icon: Waves, title: 'Piscina na cobertura', text: 'Vista privilegiada para a Praia dos Cavaleiros.' },
  { icon: Utensils, title: 'Royal Gourmet', text: 'Cozinha leve, contemporânea e serviço de bar.' },
  { icon: Wifi, title: 'Conectividade', text: 'Wi-Fi e estrutura para trabalho, lazer e eventos.' },
  { icon: Building2, title: 'Centro de eventos', text: 'Salões flexíveis para reuniões, banquetes e convenções.' },
];

type RoomCard = {
  title: string;
  image: string;
  fallback: string;
  images?: Array<{ src: string; label: string }>;
  text: string;
  tags: string[];
};

const rooms: RoomCard[] = [
  {
    title: 'Executivo',
    image: '/hotel/rooms/executivo/principal.jpg',
    fallback: '/hotel/rooms/executivo/principal.jpg',
    images: [
      { src: '/hotel/rooms/executivo/principal.jpg', label: 'Quarto Executivo' },
      { src: '/hotel/rooms/executivo/quarto-casal.jpg', label: 'Ambiente do quarto' },
      { src: '/hotel/rooms/executivo/banheiro.jpg', label: 'Banheiro' },
    ],
    text: 'Conforto objetivo para viagens corporativas e estadias rápidas.',
    tags: ['Cama confortável', 'Mesa de trabalho', 'Wi-Fi'],
  },
  {
    title: 'Master',
    image: '/hotel/rooms/master/principal.jpg',
    fallback: '/hotel/rooms/master/principal.jpg',
    images: [
      { src: '/hotel/rooms/master/principal.jpg', label: 'Quarto Master' },
      { src: '/hotel/rooms/master/quarto-vista-mar.jpg', label: 'Vista mar' },
      { src: '/hotel/rooms/master/banheiro-banheira.jpg', label: 'Banheiro com banheira' },
      { src: '/hotel/rooms/master/banheiro-sauna.jpg', label: 'Sauna privativa' },
      { src: '/hotel/rooms/master/varanda-vista-mar.jpg', label: 'Varanda frente mar' },
    ],
    text: 'Mais espaço, descanso e praticidade para estadias prolongadas.',
    tags: ['Vista mar', 'Banheira', 'Sauna privativa'],
  },
  {
    title: 'Suíte Presidencial',
    image: '/hotel/rooms/suite-presidencial/principal.jpg',
    fallback: '/hotel/rooms/suite-presidencial/principal.jpg',
    images: [
      { src: '/hotel/rooms/suite-presidencial/principal.jpg', label: 'Suíte Presidencial' },
      { src: '/hotel/rooms/suite-presidencial/estar.jpg', label: 'Sala de estar' },
      { src: '/hotel/rooms/suite-presidencial/quarto.jpg', label: 'Quarto principal' },
      { src: '/hotel/rooms/suite-presidencial/detalhe-quarto.jpg', label: 'Detalhes do quarto' },
    ],
    text: 'Experiência premium para ocasiões especiais e hospedagens executivas.',
    tags: ['Sala de estar', 'Quarto principal', 'Experiência premium'],
  },
];

const gallery = [
  { src: '/hotel/fachada.jpg', fallback: fallbackMedia.facade, label: 'Fachada' },
  { src: '/hotel/entrada-noite.jpg', fallback: fallbackMedia.facade, label: 'Entrada à noite' },
  { src: '/hotel/recepcao-instagram.jpg', fallback: fallbackMedia.lobby, label: 'Recepção' },
  { src: '/hotel/recepcao-video-poster.jpg', videoSrc: '/hotel/recepcao-video.mp4', fallback: fallbackMedia.lobby, label: 'Recepção em vídeo', type: 'video' },
  { src: '/hotel/lobby.jpg', fallback: fallbackMedia.lobby, label: 'Recepção' },
  { src: '/hotel/bar-instagram.jpg', fallback: fallbackMedia.restaurant, label: 'Bar' },
  { src: '/hotel/gastronomia-instagram.jpg', fallback: fallbackMedia.restaurant, label: 'Gastronomia' },
  { src: '/hotel/restaurante.jpg', fallback: fallbackMedia.restaurant, label: 'Gastronomia' },
  { src: '/hotel/piscina-instagram.jpg', fallback: fallbackMedia.pool, label: 'Piscina' },
  { src: '/hotel/piscina.jpg', fallback: fallbackMedia.pool, label: 'Lazer' },
  { src: '/hotel/piscina-noite.jpg', fallback: fallbackMedia.pool, label: 'Piscina à noite' },
  { src: '/hotel/lazer-instagram.jpg', fallback: fallbackMedia.pool, label: 'Lazer infantil' },
  { src: '/hotel/spa.jpg', fallback: fallbackMedia.detail, label: 'Sauna e relaxamento' },
  { src: '/hotel/academia.jpg', fallback: fallbackMedia.detail, label: 'Academia' },
  { src: '/hotel/eventos-salao.jpg', fallback: fallbackMedia.event, label: 'Eventos' },
  { src: '/hotel/eventos-rooftop.jpg', fallback: fallbackMedia.event, label: 'Eventos na cobertura' },
  { src: '/hotel/detalhes.jpg', fallback: fallbackMedia.detail, label: 'Detalhes' },
];

function MediaImage({ src, fallback, alt, className }: { src: string; fallback: string; alt: string; className?: string }) {
  const [current, setCurrent] = useState(src);

  useEffect(() => {
    setCurrent(src);
  }, [src]);

  return <img src={current} alt={alt} className={className} onError={() => setCurrent(fallback)} />;
}

function SectionIntro({ eyebrow, title, text, light = false }: { eyebrow: string; title: string; text?: string; light?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className={`text-[11px] font-black uppercase tracking-[0.28em] ${light ? 'text-white/55' : 'text-amber-700'}`}>{eyebrow}</p>
      <h2 className={`mt-4 font-display text-3xl font-light leading-[1.04] tracking-[-0.02em] sm:text-5xl lg:text-6xl ${light ? 'text-white' : 'text-stone-950'}`}>{title}</h2>
      {text && <p className={`mt-5 text-sm leading-7 sm:text-base ${light ? 'text-white/70' : 'text-stone-600'}`}>{text}</p>}
    </div>
  );
}

function EventLeadHotelSection() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    company_name: '',
    event_name: '',
    event_type: 'Corporativo',
    event_date: '',
    alternate_date: '',
    start_time: '19:00',
    attendees_count: 80,
    hall_preference: 'Salão Sétimo Andar',
    notes: '',
  });

  const canSubmit = form.customer_name.trim().length >= 3 && Boolean(form.customer_email.trim() || form.customer_phone.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const id = crypto.randomUUID();
      const payload = {
        id,
        status: 'submitted',
        customer_name: form.customer_name,
        customer_email: form.customer_email || null,
        customer_phone: form.customer_phone || null,
        company_name: form.company_name || null,
        event_name: form.event_name || null,
        event_type: form.event_type || null,
        event_date: form.event_date || null,
        alternate_date: form.alternate_date || null,
        start_time: form.start_time || null,
        attendees_count: form.attendees_count || null,
        hall_preference: form.hall_preference || null,
        budget_range: null,
        notes: form.notes || null,
        source: 'landing_events',
        utm_source: params.get('utm_source') || null,
        utm_medium: params.get('utm_medium') || null,
        utm_campaign: params.get('utm_campaign') || null,
        page_url: window.location.href,
        submitted_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        raw_payload: { ...form, source_page: 'hotel_landing' },
      };
      const { error } = await supabase.from('public_event_leads').insert([payload]);
      if (error) throw error;
      setSent(true);
      toast.success('Solicitação recebida. Nossa equipe de eventos vai entrar em contato.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível enviar a cotação agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="eventos" className="relative overflow-hidden bg-stone-950 py-20 text-white sm:py-28 lg:py-36">
      <div aria-hidden className="absolute inset-0 opacity-40">
        <MediaImage src="/hotel/eventos-salao.jpg" fallback={fallbackMedia.event} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/82 to-stone-950/35" />
      </div>
      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-5">
          <SectionIntro
            eyebrow="Eventos Royal"
            title="Salões para encontros que precisam acontecer bem."
            text="A estrutura de eventos do Royal Macaé soma mais de 1000m² em seis salões, com suporte para banquetes, reuniões, treinamentos e celebrações."
            light
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {['Seis salões moduláveis', 'Banquetes, reuniões e convenções', 'Equipe comercial integrada ao PMS'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-white/80 backdrop-blur">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-[2rem] border border-white/15 bg-white p-5 text-stone-950 shadow-[0_32px_120px_rgba(0,0,0,0.35)] sm:p-8">
            {sent ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Recebemos sua solicitação de evento.</p>
                    <p className="mt-1 text-sm leading-6">Um consultor Royal vai entrar em contato para montar sua proposta.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-700">Solicitar proposta</p>
                  <h3 className="mt-2 font-display text-3xl font-light">Cotação para eventos</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <HotelInput label="Nome" required value={form.customer_name} onChange={(v) => setForm({ ...form, customer_name: v })} />
                  <HotelInput label="WhatsApp" required value={form.customer_phone} onChange={(v) => setForm({ ...form, customer_phone: v })} />
                  <HotelInput label="E-mail" type="email" value={form.customer_email} onChange={(v) => setForm({ ...form, customer_email: v })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <HotelInput label="Empresa / responsável" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
                  <HotelInput label="Nome do evento" value={form.event_name} onChange={(v) => setForm({ ...form, event_name: v })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <HotelLabel>Tipo</HotelLabel>
                    <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 focus:bg-white">
                      {['Corporativo', 'Social', 'Casamento', 'Batizado', 'Formatura', 'Exposição', 'Outro'].map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </div>
                  <HotelInput label="Data desejada" type="date" min={today} value={form.event_date} onChange={(v) => setForm({ ...form, event_date: v })} />
                  <HotelInput label="Horário" type="time" value={form.start_time} onChange={(v) => setForm({ ...form, start_time: v })} />
                  <HotelInput label="Pessoas" type="number" value={String(form.attendees_count)} onChange={(v) => setForm({ ...form, attendees_count: Number(v) || 0 })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <HotelLabel>Salão preferido</HotelLabel>
                    <select value={form.hall_preference} onChange={(e) => setForm({ ...form, hall_preference: e.target.value })} className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 focus:bg-white">
                      {['Salão Búzios', 'Salão Rio das Ostras', 'Salão Cabo Frio', 'Sala de Reunião', 'Salão Sétimo Andar', 'Rooftop', 'Indicação do consultor'].map((hall) => <option key={hall}>{hall}</option>)}
                    </select>
                  </div>
                  <HotelInput label="Data alternativa" type="date" min={today} value={form.alternate_date} onChange={(v) => setForm({ ...form, alternate_date: v })} />
                </div>
                <div>
                  <HotelLabel>Detalhes importantes</HotelLabel>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white" />
                </div>
                <button type="submit" disabled={loading || !canSubmit} className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-stone-950 px-6 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Solicitar proposta
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HotelLabel({ children }: { children: string }) {
  return <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{children}</label>;
}

function HotelInput({ label, value, onChange, type = 'text', required, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string }) {
  return (
    <div>
      <HotelLabel>{label}</HotelLabel>
      <input required={required} type={type} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white" />
    </div>
  );
}

export default function HotelLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [roomSlides, setRoomSlides] = useState<Record<string, number>>({});
  const heroRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (window.location.hash === '#login') setLoginOpen(true);
  }, []);

  useEffect(() => {
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    let scrollHandler: (() => void) | undefined;
    import('gsap').then(({ gsap }) => {
      if (cancelled || !heroRef.current || !mediaRef.current) return;
      ctx = gsap.context(() => {
        scrollHandler = () => {
          if (!mediaRef.current) return;
          const progress = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
          gsap.to(mediaRef.current, { y: progress * 90, scale: 1 + progress * 0.06, duration: 0.35, overwrite: true });
        };
        window.addEventListener('scroll', scrollHandler, { passive: true });
        scrollHandler();
      }, heroRef);
    });
    return () => {
      cancelled = true;
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
      ctx?.revert();
    };
  }, []);

  const openLogin = () => {
    setMenuOpen(false);
    setLoginOpen(true);
    window.history.replaceState(null, '', '#login');
  };

  const expandedMedia = expandedImageIndex !== null ? gallery[expandedImageIndex] : null;
  const showPreviousImage = () => setExpandedImageIndex((current) => current === null ? current : (current - 1 + gallery.length) % gallery.length);
  const showNextImage = () => setExpandedImageIndex((current) => current === null ? current : (current + 1) % gallery.length);
  const showPreviousRoomImage = (title: string, total: number) => setRoomSlides((current) => ({ ...current, [title]: ((current[title] ?? 0) - 1 + total) % total }));
  const showNextRoomImage = (title: string, total: number) => setRoomSlides((current) => ({ ...current, [title]: ((current[title] ?? 0) + 1) % total }));

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7f2ea] text-stone-950" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${scrolled ? 'border-b border-white/20 bg-stone-950/80 backdrop-blur-xl' : 'bg-gradient-to-b from-stone-950/70 to-transparent'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <a href="#inicio" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
            <img src="/logo.png" alt="Royal Macaé Palace Hotel" className="h-10 w-10 rounded-full bg-white object-contain p-1" />
            <div className="leading-tight text-white">
              <p className="font-display text-sm font-semibold tracking-tight">Royal Macaé Palace Hotel</p>
              <p className="hidden text-[10px] uppercase tracking-[0.18em] text-white/55 sm:block">Praia dos Cavaleiros</p>
            </div>
          </a>
          <nav className="hidden items-center gap-7 lg:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-white/75 transition hover:text-white">{link.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="/sistema" className="hidden text-xs font-bold uppercase tracking-[0.18em] text-white/55 transition hover:text-white md:inline">Acesso PMS</a>
            <a href="#reservas" className="hidden rounded-full bg-white px-5 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-200 sm:inline-flex">Reservar</a>
            <button onClick={() => setMenuOpen((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white lg:hidden">
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen && (
            <motion.nav initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-white/10 bg-stone-950/95 px-5 py-4 lg:hidden">
              {navLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block border-b border-white/10 py-3 text-white/80">{link.label}</a>)}
              <a href="/sistema" className="block py-3 text-xs font-black uppercase tracking-[0.2em] text-white/50">Acesso PMS</a>
              <button onClick={openLogin} className="mt-2 w-full rounded-full border border-white/15 py-3 text-sm font-bold text-white">Entrar no PMS</button>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main>
        <section id="inicio" ref={heroRef} className="relative flex min-h-[92vh] items-end overflow-hidden pb-14 pt-28 text-white sm:pb-20 lg:min-h-screen">
          <div ref={mediaRef} className="absolute inset-0">
            <video className={`h-full w-full object-cover transition-opacity duration-700 ${heroVideoReady ? 'opacity-100' : 'opacity-0'}`} autoPlay muted loop playsInline poster="/hotel/hero.jpg" onCanPlay={() => setHeroVideoReady(true)}>
              <source src="/hotel/hero-video.mp4" type="video/mp4" />
            </video>
            <MediaImage src="/hotel/hero.jpg" fallback={fallbackMedia.hero} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${heroVideoReady ? 'opacity-0' : 'opacity-100'}`} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/45 to-stone-950/15" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:px-10">
            <div className="lg:col-span-8">
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-200">Hotel de luxo em Macaé</motion.p>
              <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 font-display text-5xl font-light leading-[0.98] tracking-[-0.03em] sm:text-7xl lg:text-8xl">
                Royal Macaé Palace Hotel
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6 max-w-2xl text-base leading-8 text-white/78 sm:text-lg">
                Hospedagem, gastronomia e eventos na Praia dos Cavaleiros, com estrutura completa para quem vem a Macaé a trabalho, lazer ou celebração.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-wrap gap-3">
                <a href="#reservas" className="inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-black text-stone-950 transition hover:bg-amber-200">Reservar direto <ArrowRight className="h-4 w-4" /></a>
                <a href="#eventos" className="inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">Cotação de eventos</a>
              </motion.div>
            </div>
            <div className="grid content-end gap-3 lg:col-span-4">
              <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
                <MapPin className="h-5 w-5 text-amber-200" />
                <p className="mt-3 text-sm font-bold">Av. Atlântica, 1642</p>
                <p className="mt-1 text-xs leading-5 text-white/65">Cavaleiros, Macaé - RJ</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white py-6">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-5 sm:px-6 lg:grid-cols-4 lg:px-10">
            {highlights.map((item) => (
              <div key={item.label} className="py-4 text-center">
                <p className="font-display text-4xl font-light text-stone-950">{item.value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="experiencia" className="py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-5">
                <SectionIntro eyebrow="Experiência Royal" title="A praia, a cidade e o hotel no mesmo roteiro." text="Localizado na Praia dos Cavaleiros, o Royal Macaé combina estrutura de hospedagem, lazer, gastronomia e eventos em uma experiência completa." />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
                <MediaImage src="/hotel/fachada.jpg" fallback={fallbackMedia.facade} alt="Fachada do hotel" className="h-80 rounded-[2rem] object-cover shadow-2xl sm:h-[28rem]" />
                <div className="grid gap-3">
                  {amenities.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                      <item.icon className="h-5 w-5 text-amber-700" />
                      <h3 className="mt-3 font-black text-stone-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="acomodacoes" className="bg-stone-950 py-20 text-white sm:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionIntro eyebrow="Acomodações" title="Quartos para descansar depois de viver Macaé." text="Acomodações modernas, funcionais e prontas para diferentes perfis de estadia." light />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {rooms.map((room) => {
                const images = room.images ?? [{ src: room.image, label: room.title }];
                const activeIndex = roomSlides[room.title] ?? 0;
                const activeImage = images[activeIndex] ?? images[0];
                const hasCarousel = images.length > 1;

                return (
                  <article key={room.title} className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06]">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <AnimatePresence mode="wait">
                        <motion.div key={activeImage.src} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.28 }} className="absolute inset-0">
                          <MediaImage src={activeImage.src} fallback={room.fallback} alt={`${room.title} - ${activeImage.label}`} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                        </motion.div>
                      </AnimatePresence>
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-stone-950/80 to-transparent p-4">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-stone-950">{activeImage.label}</span>
                        {hasCarousel && (
                          <span className="rounded-full bg-stone-950/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">{activeIndex + 1}/{images.length}</span>
                        )}
                      </div>
                      {hasCarousel && (
                        <>
                          <button type="button" onClick={() => showPreviousRoomImage(room.title, images.length)} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-stone-950/45 text-white opacity-100 backdrop-blur transition hover:bg-stone-950/70 md:opacity-0 md:group-hover:opacity-100" aria-label={`Foto anterior do quarto ${room.title}`}>
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button type="button" onClick={() => showNextRoomImage(room.title, images.length)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-stone-950/45 text-white opacity-100 backdrop-blur transition hover:bg-stone-950/70 md:opacity-0 md:group-hover:opacity-100" aria-label={`Próxima foto do quarto ${room.title}`}>
                            <ChevronRight className="h-5 w-5" />
                          </button>
                          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-1.5">
                            {images.map((image, index) => (
                              <button key={image.src} type="button" onClick={() => setRoomSlides((current) => ({ ...current, [room.title]: index }))} className={`h-1.5 rounded-full transition ${index === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75'}`} aria-label={`Ver ${image.label}`} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="font-display text-2xl font-light">{room.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/65">{room.text}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {room.tags.map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70">{tag}</span>)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="reservas" className="py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="mb-10 grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-6">
                <SectionIntro eyebrow="Reservas diretas" title="Escolha as datas e envie sua solicitação ao hotel." />
              </div>
              <p className="text-sm leading-7 text-stone-600 lg:col-span-5 lg:col-start-8">O card é integrado ao PMS para calcular tarifas públicas e enviar sua solicitação para a central de reservas.</p>
            </div>
            <PublicBookingEngine />
          </div>
        </section>

        <EventLeadHotelSection />

        <section id="galeria" className="py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <SectionIntro eyebrow="Galeria" title="Espaços que contam a experiência." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((item, index) => (
                <button key={`${item.label}-${item.src}`} type="button" onClick={() => setExpandedImageIndex(index)} className="group relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-stone-200 text-left outline-none ring-0 transition focus-visible:ring-4 focus-visible:ring-amber-300">
                  <MediaImage src={item.src} fallback={item.fallback} alt={item.label} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-stone-950/0 transition group-hover:bg-stone-950/15" />
                  {item.type === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow-2xl">
                      <PlayCircle className="h-16 w-16 fill-white/15" />
                    </span>
                  )}
                  <span className="absolute bottom-4 left-4 rounded-full bg-stone-950/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white backdrop-blur">{item.label}</span>
                  <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-stone-950 opacity-0 shadow-sm transition group-hover:opacity-100">Expandir</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="contato" className="bg-white py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-12 lg:px-10">
            <div className="lg:col-span-5">
              <SectionIntro eyebrow="Contato" title="Estamos na Praia dos Cavaleiros." text="Fale com reservas, solicite sua cotação ou trace a rota até o Royal Macaé Palace Hotel." />
            </div>
            <div className="grid gap-4 lg:col-span-7">
              {[
                { icon: Phone, label: 'Reservas', value: HOTEL_PHONE, href: `tel:${HOTEL_PHONE.replace(/\D/g, '')}` },
                { icon: Send, label: 'WhatsApp', value: '(22) 99714-2335', href: `https://wa.me/${HOTEL_WHATSAPP}` },
                { icon: Mail, label: 'E-mail', value: HOTEL_EMAIL, href: `mailto:${HOTEL_EMAIL}` },
                { icon: MapPin, label: 'Endereço', value: HOTEL_ADDRESS, href: MAPS_URL },
              ].map((item) => (
                <a key={item.label} href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-4 rounded-2xl border border-stone-200 p-5 transition hover:border-amber-300 hover:bg-amber-50">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-950 text-white"><item.icon className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">{item.label}</span>
                    <span className="mt-1 block font-bold text-stone-950">{item.value}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-[#f7f2ea] py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-full bg-white object-contain p-1" />
            <div>
              <p className="font-display text-sm font-semibold">Royal Macaé Palace Hotel</p>
              <p className="text-xs text-stone-500">Hotelaria, eventos e gastronomia em Macaé.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-[0.16em] text-stone-500">
            <a href="/sistema" className="hover:text-stone-950">Royal PMS</a>
            <button onClick={openLogin} className="hover:text-stone-950">Acesso interno</button>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {expandedMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/92 p-3 backdrop-blur-md sm:p-6"
            onClick={() => setExpandedImageIndex(null)}
          >
            <button onClick={() => setExpandedImageIndex(null)} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/20" aria-label="Fechar imagem">
              <X className="h-5 w-5" />
            </button>
            <button onClick={(event) => { event.stopPropagation(); showPreviousImage(); }} className="absolute left-4 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:flex" aria-label="Imagem anterior">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={(event) => { event.stopPropagation(); showNextImage(); }} className="absolute right-4 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:flex" aria-label="Próxima imagem">
              <ChevronRight className="h-6 w-6" />
            </button>
            <motion.figure
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="relative max-h-[88vh] w-full max-w-6xl"
              onClick={(event) => event.stopPropagation()}
            >
              {expandedMedia.type === 'video' ? (
                <div className="mx-auto h-[78vh] max-h-[820px] w-full max-w-[520px] overflow-hidden rounded-[1.5rem] bg-black shadow-2xl">
                  <video className="h-full w-full object-contain" controls autoPlay playsInline poster={expandedMedia.src}>
                    <source src={expandedMedia.videoSrc} type="video/mp4" />
                  </video>
                </div>
              ) : (
                <MediaImage src={expandedMedia.src} fallback={expandedMedia.fallback} alt={expandedMedia.label} className="max-h-[78vh] w-full rounded-[1.5rem] object-contain shadow-2xl" />
              )}
              <figcaption className="mt-4 flex flex-col gap-3 text-white sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Galeria Royal</span>
                  <span className="mt-1 block font-display text-2xl font-light">{expandedMedia.label}</span>
                </span>
                <span className="flex items-center gap-2 sm:hidden">
                  <button onClick={showPreviousImage} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Anterior</button>
                  <button onClick={showNextImage} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white">Próxima</button>
                </span>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}

        {loginOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4 backdrop-blur-md" onClick={() => setLoginOpen(false)}>
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }} className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setLoginOpen(false)} className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur">
                <X className="h-4 w-4" />
              </button>
              <Login />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
