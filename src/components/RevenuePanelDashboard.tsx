import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';

type RateRule = {
  id: string;
  name: string;
  category: string;
  season_name?: string;
  start_date: string;
  end_date: string;
  base_rate: number;
  min_nights: number;
  weekday_multiplier: number;
  weekend_multiplier: number;
  occupancy_trigger: number;
  active: boolean;
};

type RateShopperCompetitor = {
  id: string;
  name: string;
  city: string;
  locality?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  observed_rate?: number;
  category?: string;
  notes?: string;
  last_checked_at?: string;
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
      {label}
    </div>
  );
}

export default function RevenuePanelDashboard({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageProfessionalTools', ['admin', 'manager', 'finance', 'faturamento']);
  const canManageRateShopper = canManage || profile.role === 'reservations' || profile.role === 'admin';
  const loaded = useRef(false);

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<RateRule[]>([]);
  const [competitors, setCompetitors] = useState<RateShopperCompetitor[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locatedCompetitors, setLocatedCompetitors] = useState<Array<{
    name: string; city: string; locality?: string; address?: string;
    latitude?: number; longitude?: number; source?: string;
  }>>([]);
  const [form, setForm] = useState({
    name: '', category: 'executivo', season_name: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    base_rate: '250', min_nights: '1', weekday_multiplier: '1',
    weekend_multiplier: '1.2', occupancy_trigger: '80',
  });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [rulesRes, compRes] = await Promise.all([
      supabase.from('rate_rules').select('*').order('start_date', { ascending: false }),
      supabase.from('rate_shopper_competitors').select('*').order('last_checked_at', { ascending: false }),
    ]);
    if (rulesRes.data) setRules(rulesRes.data as RateRule[]);
    if (compRes.data) setCompetitors(compRes.data as RateShopperCompetitor[]);
    setLoading(false);
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('rate_rules').insert([{
      ...form,
      base_rate: Number(form.base_rate),
      min_nights: Number(form.min_nights),
      weekday_multiplier: Number(form.weekday_multiplier),
      weekend_multiplier: Number(form.weekend_multiplier),
      occupancy_trigger: Number(form.occupancy_trigger),
      active: true,
    }]);
    if (error) { toast.error('Erro ao salvar regra tarifaria: ' + error.message); return; }
    toast.success('Regra tarifaria criada.');
    setForm({ ...form, name: '' });
    fetchData();
  }

  async function locateCompetitors(event: FormEvent) {
    event.preventDefault();
    if (!canManageRateShopper || cityQuery.trim().length < 2) return;
    setLocating(true);
    try {
      const { data, error } = await supabase.functions.invoke('rate-shopper-locate', { body: { city: cityQuery.trim() } });
      if (error) throw error;
      setLocatedCompetitors(data?.competitors || []);
      if ((data?.competitors || []).length === 0) toast.info('Nenhum concorrente localizado para essa busca.');
    } catch (err) {
      console.error(err);
      toast.error('Nao foi possivel localizar concorrentes agora.');
    } finally {
      setLocating(false);
    }
  }

  async function saveCompetitor(competitor: { name: string; city: string; locality?: string; address?: string; latitude?: number; longitude?: number; source?: string }) {
    if (!canManageRateShopper) return;
    const { error } = await supabase.from('rate_shopper_competitors').insert([{
      ...competitor, observed_rate: null, category: 'hotel',
      notes: 'Localizado por busca de cidade/localidade.',
      last_checked_at: new Date().toISOString(),
    }]);
    if (error) { toast.error('Erro ao salvar concorrente: ' + error.message); return; }
    toast.success('Concorrente salvo no rate shopper.');
    fetchData();
  }

  async function updateCompetitorRate(competitor: RateShopperCompetitor, observedRate: string) {
    if (!canManageRateShopper) return;
    const parsed = Number(observedRate);
    if (!Number.isFinite(parsed) || parsed < 0) { toast.error('Informe uma tarifa valida.'); return; }
    const { error } = await supabase.from('rate_shopper_competitors')
      .update({ observed_rate: parsed, last_checked_at: new Date().toISOString() })
      .eq('id', competitor.id);
    if (error) { toast.error('Erro ao atualizar tarifa: ' + error.message); return; }
    toast.success('Tarifa concorrente atualizada.');
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={saveRule} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Motor tarifario</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Regras por temporada, categoria, ocupacao, minimo de noites e multiplicador de fim de semana.</p>
        <div className="mt-5 grid gap-3">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Nome da regra" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Categoria" />
            <input value={form.season_name} onChange={(e) => setForm({ ...form, season_name: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Temporada" />
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
            <input type="number" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Tarifa base" />
            <input type="number" value={form.min_nights} onChange={(e) => setForm({ ...form, min_nights: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Min noites" />
            <input type="number" step="0.01" value={form.weekday_multiplier} onChange={(e) => setForm({ ...form, weekday_multiplier: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Multiplicador semana" />
            <input type="number" step="0.01" value={form.weekend_multiplier} onChange={(e) => setForm({ ...form, weekend_multiplier: e.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Multiplicador FDS" />
          </div>
          <button disabled={!canManage} className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Salvar regra</button>
        </div>
      </form>

      <div className="space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-neutral-950">Rate shopper manual</h2>
          <p className="mt-2 text-sm leading-7 text-neutral-500">Localize concorrentes pela cidade/localidade, salve na base e atualize tarifa observada manualmente.</p>
          <form onSubmit={locateCompetitors} className="mt-5 flex flex-col gap-3 md:flex-row">
            <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} className="flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Ex: Macae, RJ ou Copacabana, Rio de Janeiro" />
            <button disabled={!canManageRateShopper || locating} className="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
              {locating ? 'Localizando...' : 'Localizar'}
            </button>
          </form>

          {locatedCompetitors.length > 0 && (
            <div className="mt-5 space-y-3">
              {locatedCompetitors.map((c) => (
                <div key={`${c.name}-${c.latitude}-${c.longitude}`} className="flex items-start justify-between gap-3 rounded-2xl bg-amber-50 p-4">
                  <div>
                    <p className="font-black text-neutral-900">{c.name}</p>
                    <p className="mt-1 text-sm text-neutral-600">{c.address || c.locality || c.city}</p>
                  </div>
                  <button type="button" onClick={() => saveCompetitor(c)} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white">Salvar</button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {competitors.length === 0 ? <Empty label="Nenhum concorrente salvo." /> : (() => {
              const autoScraped = competitors.filter(c => c.source === 'booking_scraper');
              const manual = competitors.filter(c => c.source !== 'booking_scraper');
              const lastUpdate = autoScraped[0]?.last_checked_at;
              return (
                <>
                  {autoScraped.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Booking.com</span>
                        <div className="flex-1 h-px bg-neutral-100" />
                        {lastUpdate && (
                          <span className="text-[10px] font-bold text-neutral-400">
                            Atualizado {new Date(lastUpdate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {autoScraped.map((c) => (
                          <div key={c.id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-neutral-900 text-sm">{c.name}</p>
                                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Auto</span>
                                </div>
                                <p className="mt-0.5 text-xs text-neutral-500">{c.city}</p>
                              </div>
                              {c.observed_rate ? (
                                <p className="text-lg font-black text-amber-700 font-mono">{money(Number(c.observed_rate))}</p>
                              ) : (
                                <p className="text-xs text-neutral-400 italic">sem preço</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {manual.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Adicionados manualmente</span>
                        <div className="flex-1 h-px bg-neutral-100" />
                      </div>
                      <div className="space-y-2">
                        {manual.map((c) => (
                          <div key={c.id} className="rounded-2xl bg-neutral-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-black text-neutral-900">{c.name}</p>
                                <p className="mt-1 text-sm text-neutral-500">{c.city} - {c.address || c.locality || 'Sem endereço'}</p>
                                {c.observed_rate ? <p className="mt-1 text-xs font-bold uppercase tracking-widest text-amber-700">Tarifa observada: {money(Number(c.observed_rate))}</p> : null}
                              </div>
                              <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('observed_rate'); updateCompetitorRate(c, String(v || '')); }} className="flex gap-2">
                                <input name="observed_rate" type="number" step="0.01" className="w-32 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm" placeholder="Tarifa" />
                                <button disabled={!canManageRateShopper} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Atualizar</button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-neutral-950">Regras ativas</h2>
          <div className="mt-5 space-y-3">
            {rules.length === 0 ? <Empty label="Nenhuma regra tarifaria criada." /> : rules.map((rule) => (
              <div key={rule.id} className="rounded-2xl bg-neutral-50 p-4">
                <p className="font-black text-neutral-900">{rule.name}</p>
                <p className="mt-1 text-sm text-neutral-500">{rule.category} - {money(Number(rule.base_rate || 0))} - minimo {rule.min_nights} noite(s)</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
