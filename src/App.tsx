/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ComponentType, useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import { UserProfile, UserRole, Company, ViewType } from './types';
import { canAccessView } from './lib/permissions';
import { ROLE_HOME_VIEW } from './lib/profileAccess';
import { usePushNotifications } from './hooks/usePushNotifications';
import PushNotificationBanner from './components/PushNotificationBanner';
import MarketingLanding from './components/MarketingLanding';
import AdminDashboard from './components/AdminDashboard';
import AdminHousekeepingManager from './components/AdminHousekeepingManager';
import ClientDashboard from './components/ClientDashboard';
import ReservationsDashboard from './components/ReservationsDashboard';
import EventsDashboard from './components/EventsDashboard';
import DashboardOverview from './components/DashboardOverview';
import Profile from './components/Profile';
import AuditDashboard from './components/AuditDashboard';
import CheckInOutDashboard from './components/CheckInOutDashboard';
import HousekeepingDashboard from './components/HousekeepingDashboard';
import OperationsDashboard from './components/OperationsDashboard';
import POSDashboard from './components/POSDashboard';
import PrioBillingGenerator from './components/PrioBillingGenerator';
import ReportsDashboard from './components/ReportsDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import PublicMaintenanceReport from './components/PublicMaintenanceReport';
import MaintenanceQueueBoard from './components/MaintenanceQueueBoard';
import MaintenanceQRPrint from './components/MaintenanceQRPrint';
import {
  AdminControlModuleDashboard,
  EventsModuleDashboard,
  FinanceBillingModuleDashboard,
  MaintenanceModuleDashboard,
  ReceptionModuleDashboard,
  ReservationsModuleDashboard,
  RestaurantModuleDashboard,
} from './components/DepartmentModules';
import MarketingModuleDashboard from './components/MarketingModule';
import {
  Loader2, User as UserIcon, LogOut, Search, X as CloseIcon,
  Building2, FileText, Users, Sparkles, LayoutDashboard,
  CalendarDays, UserCircle, Settings, Menu, Bell, Search as SearchIcon,
  ChevronRight, Hotel, Globe, ShieldCheck, UserPlus, DollarSign, KeyRound, BedDouble, ClipboardList, Utensils, BarChart3, Wrench, Receipt, Megaphone
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { tryFocusElement, consumeFocusTarget } from './lib/focusTarget';
import { motion, AnimatePresence } from 'motion/react';

type User = { id: string; email?: string; [key: string]: any };
type NavItem = {
  id: ViewType;
  label: string;
  section: 'hotel' | 'revenue' | 'management' | 'channels';
  description: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_SECTION_LABELS: Record<NavItem['section'], string> = {
  hotel: 'Hotel',
  revenue: 'Receita',
  management: 'Gestao',
  channels: 'Canais',
};

const NAV_SECTION_ORDER: NavItem['section'][] = ['hotel', 'revenue', 'management', 'channels'];

const NAV_META: Record<ViewType, Pick<NavItem, 'section' | 'description'>> = {
  dashboard: { section: 'hotel', description: 'Resumo executivo e atalhos do dia' },
  reservations: { section: 'hotel', description: 'Reservas, tarifas e calendario' },
  reception: { section: 'hotel', description: 'Check-in, UHs e turno' },
  maintenance: { section: 'hotel', description: 'Chamados e preventiva' },
  checkin: { section: 'hotel', description: 'Entradas, saidas e walk-in' },
  housekeeping: { section: 'hotel', description: 'Limpeza, bloqueios e liberacao' },
  operations: { section: 'hotel', description: 'Passagem de turno e pendencias' },
  pos: { section: 'hotel', description: 'Consumo, comandas e caixa' },
  events: { section: 'hotel', description: 'Agenda, orcamentos e saloes' },
  finance: { section: 'revenue', description: 'Faturas, bancos e cobranca' },
  'prio-billing': { section: 'revenue', description: 'Geracao e conferencia Prio' },
  tariffs: { section: 'revenue', description: 'Tarifario corporativo' },
  reports: { section: 'revenue', description: 'Indicadores e exportacoes' },
  'admin-control': { section: 'management', description: 'Usuarios, permissoes e cadastros' },
  companies: { section: 'management', description: 'Clientes corporativos' },
  guests: { section: 'management', description: 'Perfis e historico' },
  tracking: { section: 'management', description: 'Fluxo operacional e financeiro' },
  registration: { section: 'management', description: 'Usuarios e acessos' },
  staff: { section: 'management', description: 'Colaboradores e permissoes' },
  audit: { section: 'management', description: 'Logs e trilha de acoes' },
  'maintenance-qr': { section: 'management', description: 'Impressao de QR por UH' },
  'housekeeping-staff': { section: 'management', description: 'Equipe de governanca' },
  marketing: { section: 'channels', description: 'Omni-inbox e campanhas' },
  profile: { section: 'management', description: 'Preferencias e seguranca da conta' },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const { status: pushStatus, subscribe: subscribePush } = usePushNotifications(profile?.id);
  const [currentView, setCurrentViewRaw] = useState<ViewType>(
    () => (sessionStorage.getItem('pms_current_view') as ViewType) || 'dashboard'
  );

  const setCurrentView = (view: ViewType) => {
    sessionStorage.setItem('pms_current_view', view);
    setCurrentViewRaw(view);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{
    companies: any[],
    files: any[],
    users: any[]
  }>({ companies: [], files: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Quando a view muda por causa da busca global, aciona o "zoom" no item alvo
  useEffect(() => {
    const target = consumeFocusTarget();
    if (!target) return;
    // recoloca para uso pelo handler interno
    try { sessionStorage.setItem('focusTarget', JSON.stringify(target)); } catch {}
    // aguarda a aba destino montar e renderizar a lista
    tryFocusElement(target.id, { attempts: 20, delayMs: 250 });
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const searchTimerRef = useState<{ id: ReturnType<typeof setTimeout> | null }>({ id: null })[0];

  const runGlobalSearch = async (term: string) => {
    setIsSearching(true);
    try {
      const role = profile?.role;
      const isAdmin = role === 'admin';
      const isStaff = role === 'admin' || role === 'manager' || role === 'reservations' || role === 'reception' || role === 'faturamento' || role === 'finance' || role === 'eventos' || role === 'restaurant' || role === 'housekeeping' || role === 'maintenance';
      const isClientLike = role === 'client' || role === 'external_client';

      // Cliente: só vê seus próprios arquivos. Staff: vê tudo.
      const filesQuery = supabase.from('files').select('*').or(`original_name.ilike.%${term}%,type.ilike.%${term}%`);
      if ((role === 'client' || role === 'external_client') && profile?.company_id) {
        filesQuery.eq('company_id', profile.company_id);
      }

      const tasks: PromiseLike<any>[] = [
        // Empresas: clientes não veem listagem de outras empresas
        isStaff
          ? supabase.from('companies').select('*').or(`name.ilike.%${term}%,cnpj.ilike.%${term}%`)
          : Promise.resolve({ data: [] }),
        role === 'external_client'
          ? Promise.resolve({ data: [] })
          : filesQuery,
        // Equipe: somente admin pode pesquisar perfis
        isAdmin
          ? supabase.from('profiles').select('*').or(`name.ilike.%${term}%,email.ilike.%${term}%`)
          : Promise.resolve({ data: [] }),
      ];

      const [companiesRes, filesRes, usersRes] = await Promise.all(tasks);

      setSearchResults({
        companies: companiesRes.data || [],
        files: (filesRes.data || []).filter((f: any) => !isClientLike || f.company_id === profile?.company_id),
        users: (usersRes.data || []).map((u: any) => {
          // Nunca expor hash de senha mesmo que o backend devolva
          const { password_hash, ...rest } = u;
          return rest;
        })
      });
    } catch (error) {
      console.error("Global search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleGlobalSearch = (term: string) => {
    setGlobalSearchTerm(term);
    if (searchTimerRef.id) clearTimeout(searchTimerRef.id);
    if (term.length < 2) {
      setSearchResults({ companies: [], files: [], users: [] });
      return;
    }
    searchTimerRef.id = setTimeout(() => runGlobalSearch(term), 300);
  };

  const fetchProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      
      if (error) return null;

      if (data) {
        const userProfile = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          company_id: data.company_id,
          photo_url: data.photo_url,
          permissions: data.permissions ?? undefined,
        } as UserProfile;
        setProfile(userProfile);
        // Só redireciona para a home view no primeiro login — não em recargas de página
        if (!sessionStorage.getItem('pms_current_view')) {
          setCurrentView(ROLE_HOME_VIEW[userProfile.role as UserRole] || 'dashboard');
        }
        return userProfile;
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 8000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('[App] getSession result:', session ? 'has session' : 'no session');
        if (session?.user) {
          setUser(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('[App] getSession error:', e);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[App] onAuthStateChange:', event, session ? 'has session' : 'no session');
      setUser(session?.user ?? null);
      if (!user) {
        setProfile(null);
        setCurrentView('dashboard');
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const syncProfile = async () => {
      try {
        console.log('[App] syncProfile starting for user', user.id);
        const profileData = await fetchProfile(user.id);
        console.log('[App] fetchProfile returned:', profileData ? 'profile found' : 'no profile');

        if (!profileData) {
          // Fallback profile so the app can still render even if insert fails
          const fallbackProfile: UserProfile = {
            id: user.id,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
            email: user.email || '',
            role: 'client',
          };

          try {
            await supabase.from('profiles').insert([fallbackProfile]);
            console.log('[App] inserted new profile');
          } catch (insertErr) {
            console.error('[App] profile insert failed, using fallback anyway:', insertErr);
          }

          setProfile(fallbackProfile);
          setCurrentView(ROLE_HOME_VIEW[fallbackProfile.role as UserRole] || 'dashboard');
        }
      } catch (err) {
        console.error('[App] syncProfile error:', err);
      } finally {
        setLoading(false);
      }
    };

    syncProfile();
  }, [user]);

  // Se a view atual foi bloqueada pelas permissões, redireciona para a primeira disponível
  useEffect(() => {
    if (!profile) return;
    if (!canAccessView(profile, currentView)) {
      const order: ViewType[] = ['dashboard', 'reservations', 'reception', 'maintenance', 'pos', 'events', 'finance', 'prio-billing', 'tariffs', 'admin-control', 'checkin', 'housekeeping', 'operations', 'guests', 'companies', 'tracking', 'registration', 'staff', 'audit'];
      const next = order.find(v => canAccessView(profile, v));
      if (next && next !== currentView) setCurrentView(next);
    }
  }, [profile, currentView]);

  // Fetch notifications for current user
  const fetchNotifications = async () => {
    if (!profile) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', profile.id);
    if (data) setNotifications(data.sort((a: any, b: any) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')));
  };

  useEffect(() => {
    if (!profile) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [profile]);

  const markAllRead = async () => {
    const unread = notifications.filter((n: any) => !n.read);
    await Promise.all(unread.map((n: any) =>
      supabase.from('notifications').update({ read: true }).eq('id', n.id)
    ));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const navigationItems = useMemo(() => {
    if (!profile) return [];

    const items = [
      { id: 'dashboard' as ViewType, label: 'Painel', icon: LayoutDashboard },
      { id: 'reservations' as ViewType, label: 'Reservas', icon: CalendarDays },
      { id: 'reception' as ViewType, label: 'Recepção', icon: KeyRound },
      { id: 'maintenance' as ViewType, label: 'Manutenção', icon: Wrench },
      { id: 'checkin' as ViewType, label: 'Check-in/out', icon: KeyRound },
      { id: 'housekeeping' as ViewType, label: 'Governança', icon: BedDouble },
      { id: 'operations' as ViewType, label: 'Operações', icon: ClipboardList },
      { id: 'pos' as ViewType, label: 'POS Restaurante', icon: Utensils },
      { id: 'events' as ViewType, label: 'Eventos', icon: Globe },
      { id: 'guests' as ViewType, label: 'Hóspedes', icon: UserCircle },
      { id: 'companies' as ViewType, label: 'Empresas', icon: Building2 },
      { id: 'tracking' as ViewType, label: 'Rastreio', icon: Search },
      { id: 'finance' as ViewType, label: 'Finanças', icon: FileText },
      { id: 'prio-billing' as ViewType, label: 'Faturamento Prio', icon: Receipt },
      { id: 'tariffs' as ViewType, label: 'Tarifas', icon: DollarSign },
      { id: 'registration' as ViewType, label: 'Cadastro', icon: UserPlus },
      { id: 'staff' as ViewType, label: 'Equipe', icon: Users },
      { id: 'audit' as ViewType, label: 'Auditoria', icon: ShieldCheck },
      { id: 'admin-control' as ViewType, label: 'Admin', icon: ShieldCheck },
      { id: 'reports' as ViewType, label: 'Relatórios', icon: BarChart3 },
      { id: 'maintenance-qr' as ViewType, label: 'QR Manutenção', icon: Wrench },
      { id: 'housekeeping-staff' as ViewType, label: 'Camareiras', icon: Users },
      { id: 'marketing' as ViewType, label: 'Marketing', icon: Megaphone },
    ];

    const hiddenLegacyViews: ViewType[] = ['checkin', 'housekeeping', 'operations', 'guests', 'companies', 'tracking', 'tariffs', 'registration', 'staff', 'audit'];
    return items.filter(item => !hiddenLegacyViews.includes(item.id) && canAccessView(profile, item.id));
  }, [profile]);

  const groupedNavigation = useMemo(() => {
    return NAV_SECTION_ORDER
      .map(section => ({
        section,
        label: NAV_SECTION_LABELS[section],
        items: navigationItems
          .filter(item => NAV_META[item.id]?.section === section)
          .map(item => ({ ...item, description: NAV_META[item.id]?.description ?? item.label })),
      }))
      .filter(group => group.items.length > 0);
  }, [navigationItems]);

  // Bottom nav: up to 4 priority items based on role (must be before early returns — Rules of Hooks)
  const mobileNavPriority: ViewType[] = ['dashboard', 'reservations', 'reception', 'finance'];
  const bottomNavItems = useMemo(() => {
    const priority = navigationItems.filter(i => mobileNavPriority.includes(i.id));
    const rest = navigationItems.filter(i => !mobileNavPriority.includes(i.id));
    return [...priority, ...rest].slice(0, 4);
  }, [navigationItems]);

  const [showMoreSheet, setShowMoreSheet] = useState(false);

  // Public routes — bypass auth gate
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const reportMatch = path.match(/^\/report\/([^/?#]+)\/?$/);
  if (reportMatch) {
    const qrToken = new URLSearchParams(window.location.search).get('k') ?? '';
    return <PublicMaintenanceReport roomNumber={decodeURIComponent(reportMatch[1])} qrToken={qrToken} />;
  }
  if (path === '/board/maintenance') {
    // Requires authentication — do not expose active tickets publicly
    if (!user) {
      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
          <div className="text-center bg-white/5 border border-white/10 rounded-3xl p-8 max-w-sm">
            <h1 className="text-xl font-black text-white">Acesso restrito</h1>
            <p className="mt-2 text-sm text-neutral-400">Faca login para visualizar o quadro de manutencao.</p>
          </div>
        </div>
      );
    }
    return <MaintenanceQueueBoard />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FA]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="p-4 bg-white rounded-3xl shadow-xl flex items-center justify-center overflow-hidden w-20 h-20">
             <img 
               src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s" 
               alt="Logo" 
               className="w-full h-full object-contain"
               referrerPolicy="no-referrer"
             />
          </div>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Iniciando PMS Desktop</p>
        </motion.div>
      </div>
    );
  }

  if (!user || !profile) return <MarketingLanding />;

  const activeNavigationItem = navigationItems.find(i => i.id === currentView);
  const activeMeta = NAV_META[currentView];
  const activeSectionLabel = activeMeta ? NAV_SECTION_LABELS[activeMeta.section] : 'Sistema';

  const renderContent = () => {
    switch (currentView) {
      case 'profile': return <Profile profile={profile} onBack={() => setCurrentView(ROLE_HOME_VIEW[profile.role as UserRole] || 'dashboard')} />;
      case 'reservations': return (profile.role === 'client' || profile.role === 'external_client') ? <ClientDashboard profile={profile} initialTab="reservations" /> : <ReservationsModuleDashboard profile={profile} />;
      case 'reception': return <ReceptionModuleDashboard profile={profile} />;
      case 'maintenance': return <MaintenanceModuleDashboard profile={profile} />;
      case 'checkin': return <CheckInOutDashboard profile={profile} />;
      case 'housekeeping': return <HousekeepingDashboard profile={profile} />;
      case 'operations': return <OperationsDashboard profile={profile} />;
      case 'pos': return <RestaurantModuleDashboard profile={profile} />;
      case 'guests': return <AdminDashboard profile={profile} initialTab="guests" />;
      case 'tracking': return <AdminDashboard profile={profile} initialTab="tracking" />;
      case 'tariffs': return <AdminDashboard profile={profile} initialTab="tariffs" />;
      case 'registration': return <AdminDashboard profile={profile} initialTab="registration" />;
      case 'events': return <EventsModuleDashboard profile={profile} />;
      case 'finance': return (profile.role === 'admin' || profile.role === 'faturamento' || profile.role === 'finance' || profile.role === 'manager') ? <FinanceBillingModuleDashboard profile={profile} /> : <ClientDashboard profile={profile} initialTab="active" />;
      case 'prio-billing': return <PrioBillingGenerator profile={profile} />;
      case 'reports': return <ReportsDashboard profile={profile} />;
      case 'companies': return <AdminDashboard profile={profile} initialTab="companies" />;
      case 'staff': return <AdminDashboard profile={profile} initialTab="users" />;
      case 'admin-control': return <AdminControlModuleDashboard profile={profile} />;
      case 'audit': return <AuditDashboard profile={profile} />;
      case 'maintenance-qr': return <MaintenanceQRPrint />;
      case 'housekeeping-staff': return <AdminHousekeepingManager />;
      case 'marketing': return <MarketingModuleDashboard profile={profile} />;
      case 'dashboard':
      default:
        return (profile.role === 'client' || profile.role === 'external_client')
               ? <ClientDashboard profile={profile} initialTab={profile.role === 'external_client' ? 'reservations' : 'active'} />
               : 
               (profile.role === 'admin' || profile.role === 'manager' || profile.role === 'faturamento' || profile.role === 'finance' || profile.role === 'reception' || profile.role === 'reservations' || profile.role === 'eventos' || profile.role === 'restaurant' || profile.role === 'housekeeping' || profile.role === 'maintenance') ? <DashboardOverview profile={profile} onNavigate={(view) => setCurrentView(view as ViewType)} /> :
               <ReservationsDashboard profile={profile} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden font-sans text-gray-900">
      <Toaster position="top-right" richColors />
      <PushNotificationBanner status={pushStatus} onSubscribe={subscribePush} />

      {/* ── DESKTOP SIDEBAR ─────────────────────────────── */}
      {!isMobile && <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="flex h-full bg-white border-r border-gray-200 flex-col relative z-50 shadow-sm shrink-0"
      >
        <div className="p-6 flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-white border border-neutral-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-1">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s"
              alt="Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="whitespace-nowrap">
                <h1 className="text-xl font-black tracking-tighter italic text-amber-500 uppercase">ROYAL</h1>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 px-3 mt-4 overflow-y-auto scrollbar-none">
          <div className="space-y-5">
            {groupedNavigation.map((group) => (
              <div key={group.section} className="space-y-1">
                {isSidebarOpen && (
                  <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.22em] text-gray-300">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    title={!isSidebarOpen ? item.label : undefined}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group relative ${
                      currentView === item.id ? 'bg-primary/5 text-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 shrink-0 ${currentView === item.id ? 'text-primary' : 'group-hover:text-gray-900'}`} />
                    <AnimatePresence>
                      {isSidebarOpen && (
                        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-bold whitespace-nowrap">
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {currentView === item.id && (
                      <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={`flex items-center gap-3 ${isSidebarOpen ? '' : 'justify-center'}`}>
            <button onClick={() => setCurrentView('profile')} className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 hover:border-primary transition-all cursor-pointer">
              {profile.photo_url ? <img src={profile.photo_url} alt="Profile" className="w-full h-full object-cover" /> : (
                <div className="w-full h-full flex items-center justify-center text-gray-400"><UserIcon className="w-5 h-5" /></div>
              )}
            </button>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
                <div className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-green-500" />
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider truncate">{profile.role}</span>
                </div>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={() => supabase.auth.signOut()} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-full mt-4 flex items-center justify-center p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </motion.aside>}

      {/* ── MAIN CONTENT ────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] relative overflow-hidden">

        {/* ── Mobile header ── */}
        {isMobile && <header className="h-14 bg-white border-b border-gray-100 px-4 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white border border-neutral-200 shadow-sm overflow-hidden p-0.5 shrink-0">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s" alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <span className="text-sm font-black text-gray-900 truncate">
              {activeNavigationItem?.label || 'Royal PMS'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setIsSearchOpen(true)} className="p-2.5 text-gray-400 rounded-xl active:bg-gray-100">
              <SearchIcon className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
                className="p-2.5 text-gray-400 rounded-xl active:bg-gray-100 relative"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter((n: any) => !n.read).length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-neutral-900">Notificações</span>
                    <button onClick={() => setShowNotifications(false)} className="text-neutral-400 text-xs font-bold">Fechar</button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-neutral-50">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-neutral-400 text-center py-8">Nenhuma notificação</p>
                    ) : (
                      notifications.slice(0, 20).map((n: any) => (
                        <div key={n.id} className={`px-4 py-3 ${n.read ? 'bg-white' : 'bg-blue-50'}`}>
                          <p className="text-sm font-bold text-neutral-900">{n.title}</p>
                          <p className="text-sm text-neutral-500 mt-0.5">{n.message}</p>
                          <p className="text-xs text-neutral-300 mt-1">{n.timestamp ? new Date(n.timestamp).toLocaleString('pt-BR') : ''}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setCurrentView('profile')} className="ml-1 w-8 h-8 rounded-full bg-gray-100 overflow-hidden active:opacity-70 shrink-0">
              {profile.photo_url ? <img src={profile.photo_url} alt="" className="w-full h-full object-cover" /> : (
                <div className="w-full h-full flex items-center justify-center text-gray-400"><UserIcon className="w-4 h-4" /></div>
              )}
            </button>
          </div>
        </header>}

        {/* ── Desktop header ── */}
        {!isMobile && <header className="flex h-16 bg-white border-b border-gray-200 px-8 items-center justify-between sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
              <span className="text-gray-400">{activeSectionLabel}</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
              {activeNavigationItem?.label || 'Sistema'}
            </h2>
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <SearchIcon className="w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors" />
              </div>
              <input type="text" placeholder="Busca global (Ctrl + K)" onClick={() => setIsSearchOpen(true)} readOnly
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-72 lg:w-80 cursor-pointer focus:ring-2 focus:ring-primary/10 transition-all outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) markAllRead(); }}
                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all relative">
                <Bell className="w-5 h-5" />
                {notifications.filter((n: any) => !n.read).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-neutral-900">Notificações</span>
                    <button onClick={() => setShowNotifications(false)} className="text-neutral-400 hover:text-neutral-700 text-xs">Fechar</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-neutral-400 text-center py-6">Nenhuma notificação</p>
                    ) : (
                      notifications.slice(0, 20).map((n: any) => (
                        <div key={n.id} className={`px-4 py-3 ${n.read ? 'bg-white' : 'bg-blue-50'}`}>
                          <p className="text-xs font-bold text-neutral-900">{n.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{n.message}</p>
                          <p className="text-[10px] text-neutral-300 mt-1">{n.timestamp ? new Date(n.timestamp).toLocaleString('pt-BR') : ''}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="h-6 w-[1px] bg-gray-200 mx-1" />
            <div className="flex flex-col items-end">
              <p className="text-xs font-black text-gray-900">Hotel Royal Macaé</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Terminal 01 • Conectado</p>
            </div>
          </div>
        </header>}

        {/* ── Page content ── */}
        <div className={`flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 scrollbar-none ${isMobile ? 'mb-bottom-nav' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={currentView === 'marketing' ? 'w-full' : 'max-w-7xl mx-auto'}
            >
              <ErrorBoundary key={currentView}>{renderContent()}</ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAVIGATION ────────────────────── */}
      {isMobile && navigationItems.length > 0 && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] pb-safe">
          <div className={`grid h-16 ${bottomNavItems.length < 4 ? `grid-cols-${bottomNavItems.length + 1}` : 'grid-cols-5'}`}>
            {bottomNavItems.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${
                    active ? 'text-primary' : 'text-gray-400'
                  }`}
                >
                  <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-primary/10' : ''}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] font-bold leading-none ${active ? 'text-primary' : 'text-gray-400'}`}>
                    {item.label.length > 8 ? item.label.slice(0, 7) + '…' : item.label}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setShowMoreSheet(true)}
              className="flex flex-col items-center justify-center gap-0.5 text-gray-400 active:scale-95 transition-colors"
            >
              <div className="p-1.5 rounded-xl">
                <Menu className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold leading-none">Mais</span>
            </button>
          </div>
        </nav>
      )}

      {/* ── MOBILE "MAIS" BOTTOM SHEET ──────────────────── */}
      <AnimatePresence>
        {isMobile && showMoreSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMoreSheet(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              {/* Profile row */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-2xl bg-gray-100 overflow-hidden shrink-0">
                  {profile.photo_url ? <img src={profile.photo_url} alt="" className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400"><UserIcon className="w-5 h-5" /></div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{profile.name}</p>
                  <p className="text-xs text-gray-400 font-medium capitalize">{profile.role}</p>
                </div>
                <button onClick={() => setShowMoreSheet(false)} className="ml-auto p-2 rounded-full bg-gray-100 text-gray-500">
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              {/* All navigation items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {groupedNavigation.map((group) => (
                  <div key={group.section} className="space-y-2">
                    <p className="px-1 text-[10px] font-black uppercase tracking-[0.22em] text-gray-300">{group.label}</p>
                    <div className="grid grid-cols-3 gap-3">
                      {group.items.map((item) => {
                        const active = currentView === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => { setCurrentView(item.id); setShowMoreSheet(false); }}
                            className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all active:scale-95 ${
                              active ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            <span className="text-[11px] font-bold text-center leading-tight">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer actions */}
              <div className="p-4 border-t border-gray-100 pb-safe flex gap-2">
                <button onClick={() => { setCurrentView('profile'); setShowMoreSheet(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm active:bg-gray-200">
                  <UserIcon className="w-4 h-4" />
                  Meu Perfil
                </button>
                <button onClick={() => supabase.auth.signOut()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-50 text-red-600 font-bold text-sm active:bg-red-100">
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-20 bg-gray-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200"
            >
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <SearchIcon className="w-5 h-5 text-primary" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar em todo o hotel..."
                  value={globalSearchTerm}
                  onChange={(e) => handleGlobalSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-lg text-gray-900 font-medium"
                />
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all"
                >
                  <CloseIcon className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
                {isSearching ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Vasculhando rede...</p>
                  </div>
                ) : globalSearchTerm.length < 2 ? (
                  <div className="py-20 text-center">
                    <div className="p-4 bg-gray-50 rounded-full inline-block mb-4">
                      <Sparkles className="w-10 h-10 text-gray-200" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Atalho inteligente (⌘K)</p>
                  </div>
                ) : (
                  <>
                    {searchResults.companies.length === 0 && searchResults.files.length === 0 && searchResults.users.length === 0 && (
                      <div className="py-16 text-center">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nenhum resultado encontrado</p>
                      </div>
                    )}
                    {searchResults.companies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'company', id: c.id, name: c.name }));
                          setCurrentView('admin-control');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-blue-50 rounded-lg"><Building2 className="w-5 h-5 text-blue-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{c.name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Empresa • CNPJ: {c.cnpj}</p>
                        </div>
                      </button>
                    ))}
                    {searchResults.files.map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'file', id: f.id, name: f.original_name }));
                          setCurrentView('finance');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-purple-50 rounded-lg"><FileText className="w-5 h-5 text-purple-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{f.original_name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Arquivo • {f.type}</p>
                        </div>
                      </button>
                    ))}
                    {searchResults.users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          sessionStorage.setItem('focusTarget', JSON.stringify({ type: 'user', id: u.id, name: u.name }));
                          setCurrentView('admin-control');
                          setIsSearchOpen(false);
                          setGlobalSearchTerm('');
                        }}
                        className="w-full text-left flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl cursor-pointer group"
                      >
                        <div className="p-2 bg-green-50 rounded-lg"><Users className="w-5 h-5 text-green-600" /></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{u.name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">Equipe • {u.role}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Pressione <span className="text-gray-900">ESC</span> para fechar</p>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-white bg-gray-900 px-1.5 py-0.5 rounded shadow-sm">ENTER</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
