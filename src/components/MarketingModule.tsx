import { useState } from 'react';
import { UserProfile } from '../types';
import type { Lead } from '../types/marketing';
import { SEED_LEADS } from '../constants/marketingSeeds';
import { FinanceiroTab } from './marketing/FinanceiroTab';
import { LeadInboxTab } from './marketing/LeadInboxTab';
import { CampaignsTab } from './marketing/CampaignsTab';
import { TemplatesTab } from './marketing/TemplatesTab';
import { AnalyticsTab } from './marketing/AnalyticsTab';
import { NPSTab } from './marketing/NPSTab';
import { BotTrainingTab } from './marketing/BotTrainingTab';
import { CRMTab } from './marketing/CRMTab';
import { SimulatorTab } from './marketing/SimulatorTab';
import { FlowBuilderTab } from './marketing/FlowBuilderTab';
import { BroadcastsTab } from './marketing/BroadcastsTab';
import { IntegracoesTab } from './marketing/IntegracoesTab';
import {
  MessageSquare, Instagram, Facebook, Search, CheckCircle2, Clock, Send,
  Zap, Twitter, Linkedin, Video, Globe, Users, Sparkles, ClipboardList,
  AlertCircle, Tag, UserPlus, LayoutGrid, Plus, Trash2, Copy, Edit3, Save,
  X, Star, TrendingUp, BarChart3, Target, Smile, Meh, Frown, ArrowUpRight,
  Calendar, Bell, Smartphone, Filter, Bookmark, MoreVertical, RefreshCw,
  Hotel, MapPin, Phone, BedDouble, DollarSign, Mail, Wand2, MessageCircle,
  ShieldCheck, TrendingDown, ChevronDown, ChevronRight, Eye, ArrowRight,
  Megaphone, Bot, Activity, Heart, Award, Settings, Layers, Inbox,
  QrCode, CreditCard, Banknote, Link2, ExternalLink, RefreshCcw, Database, Cloud,
  CheckCircle, XCircle, Wifi, Key,
} from 'lucide-react';

interface MarketingModuleDashboardProps {
  profile: UserProfile;
}


export default function MarketingModuleDashboard({ profile }: MarketingModuleDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('inbox');

  const totalLeads = SEED_LEADS.length;
  const newLeads = SEED_LEADS.filter(l => l.status === 'new').length;
  const needsHuman = SEED_LEADS.filter(l => l.status === 'needs_human').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="rounded-3xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-amber-600">Marketing & CRM</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-black text-neutral-950">HospedaAI — Central de Marketing</h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500">
              Omni-inbox, campanhas, automações, NPS e IA para maximizar conversões.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-amber-50">
              <span className="text-lg font-black text-amber-700">{newLeads}</span>
              <span className="text-[9px] font-bold text-amber-600 uppercase">Novos</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-red-50">
              <span className="text-lg font-black text-red-700">{needsHuman}</span>
              <span className="text-[9px] font-bold text-red-600 uppercase">Humano</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-neutral-50">
              <span className="text-lg font-black text-neutral-700">{totalLeads}</span>
              <span className="text-[9px] font-bold text-neutral-500 uppercase">Total</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="max-w-full overflow-x-auto scrollbar-none">
        <div className="flex gap-2 pb-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === 'inbox' && <LeadInboxTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'broadcasts' && <BroadcastsTab />}
        {activeTab === 'flows' && <FlowBuilderTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'crm' && <CRMTab />}
        {activeTab === 'nps' && <NPSTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'simulator' && <SimulatorTab />}
        {activeTab === 'training' && <BotTrainingTab />}
        {activeTab === 'financeiro' && <FinanceiroTab />}
        {activeTab === 'integracoes' && <IntegracoesTab />}
      </div>
    </div>
  );
}
