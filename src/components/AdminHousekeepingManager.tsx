import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { Plus, Trash2, Edit2, Key, Users, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Phone, FileText, ClipboardList, BarChart3, Printer } from 'lucide-react';

type StaffMember = {
  id: string;
  name: string;
  floor_number: number;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
};

type StaffTicket = {
  id: string;
  status_reason: string | null;
  status: string;
  created_at: string;
  room_number: string | null;
  title: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

type HousekeepingView = 'roster' | 'performance';

export default function AdminHousekeepingManager() {
  const [view, setView] = useState<HousekeepingView>('roster');

  return (
    <div className="p-4 sm:p-6">
      <div className="flex max-w-full overflow-x-auto gap-2 mb-6 border-b border-gray-200">
        {([
          { id: 'roster' as const, label: 'Cadastro', icon: Users },
          { id: 'performance' as const, label: 'Desempenho', icon: BarChart3 },
        ]).map(tab => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${
                active ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {view === 'roster' && <HousekeepingRosterTab />}
      {view === 'performance' && <HousekeepingPerformanceTab />}
    </div>
  );
}

function HousekeepingRosterTab() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [ticketsByStaff, setTicketsByStaff] = useState<Record<string, StaffTicket[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFloor, setFormFloor] = useState(1);
  const [formPin, setFormPin] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [staffRes, ticketsRes] = await Promise.all([
      supabase
        .from('housekeeping_staff')
        .select('id, name, floor_number, phone, notes, is_active, last_used_at, created_at')
        .order('floor_number', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('maintenance_tickets')
        .select('id, status_reason, status, created_at, room_number, title')
        .ilike('status_reason', 'Reportado por:%')
        .order('created_at', { ascending: false }),
    ]);

    if (staffRes.data) setStaff(staffRes.data as StaffMember[]);

    if (ticketsRes.data) {
      const map: Record<string, StaffTicket[]> = {};
      for (const t of ticketsRes.data as StaffTicket[]) {
        const match = t.status_reason?.match(/^Reportado por:\s*(.+?)(\s*\(|$)/);
        const name = match?.[1]?.trim();
        if (name) {
          if (!map[name]) map[name] = [];
          map[name].push(t);
        }
      }
      setTicketsByStaff(map);
    }

    setLoading(false);
  }

  function openAddForm() {
    setFormName(''); setFormFloor(1); setFormPin('');
    setFormPhone(''); setFormNotes(''); setFormError('');
    setEditingId(null); setShowForm(true);
  }

  function openEditForm(member: StaffMember) {
    setFormName(member.name);
    setFormFloor(member.floor_number);
    setFormPin('');
    setFormPhone(member.phone ?? '');
    setFormNotes(member.notes ?? '');
    setFormError('');
    setEditingId(member.id);
    setShowForm(true);
  }

  async function handleSave() {
    setFormError('');
    if (!formName.trim()) { setFormError('Nome é obrigatório.'); return; }
    if (formPin && formPin.length !== 4) { setFormError('PIN deve ter 4 dígitos.'); return; }
    if (!editingId && !formPin) { setFormError('PIN é obrigatório para novo cadastro.'); return; }
    setSaving(true);
    try {
      const baseFields = {
        name: formName.trim(),
        floor_number: formFloor,
        phone: formPhone.trim() || null,
        notes: formNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const updates: Record<string, unknown> = { ...baseFields };
        if (formPin) updates.pin_hash = await sha256(formPin);
        const { error } = await supabase.from('housekeeping_staff').update(updates).eq('id', editingId);
        if (error) {
          setFormError(error.code === '23505' ? 'Este PIN já está em uso por outra camareira.' : 'Erro ao atualizar: ' + error.message);
          setSaving(false); return;
        }
      } else {
        const { error } = await supabase.from('housekeeping_staff').insert({ ...baseFields, pin_hash: await sha256(formPin) });
        if (error) {
          setFormError(error.code === '23505' ? 'Este PIN já está em uso.' : 'Erro ao cadastrar: ' + error.message);
          setSaving(false); return;
        }
      }
      setShowForm(false);
      fetchAll();
    } catch {
      setFormError('Erro inesperado.');
    }
    setSaving(false);
  }

  async function handleToggleActive(member: StaffMember) {
    const { error } = await supabase
      .from('housekeeping_staff')
      .update({ is_active: !member.is_active, updated_at: new Date().toISOString() })
      .eq('id', member.id);
    if (!error) fetchAll();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('housekeeping_staff').delete().eq('id', id);
    if (!error) { setConfirmDelete(null); fetchAll(); }
  }

  const byFloor = staff.reduce<Record<number, StaffMember[]>>((acc, m) => {
    if (!acc[m.floor_number]) acc[m.floor_number] = [];
    acc[m.floor_number].push(m);
    return acc;
  }, {});
  const floors = Object.keys(byFloor).map(Number).sort((a, b) => a - b);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-600" />
            Camareiras
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {staff.filter(s => s.is_active).length} ativas · {staff.length} cadastradas
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nova Camareira
        </button>
      </div>

      {/* Empty state */}
      {staff.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">Nenhuma camareira cadastrada.</p>
          <p className="text-sm text-gray-400 mt-1">Clique em "Nova Camareira" para começar.</p>
        </div>
      )}

      {/* Staff grouped by floor */}
      {floors.map(floor => (
        <div key={floor} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{floor}º Andar</span>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] font-bold text-gray-400">{byFloor[floor].length} camareira{byFloor[floor].length !== 1 ? 's' : ''}</span>
          </div>

          <div className="grid gap-2">
            {byFloor[floor].map(member => {
              const tickets = ticketsByStaff[member.name] ?? [];
              const isExpanded = expandedId === member.id;
              return (
                <div
                  key={member.id}
                  className={`bg-white border rounded-xl transition shadow-sm ${
                    member.is_active ? 'border-gray-200' : 'border-red-200 opacity-70'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                      member.is_active ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {member.floor_number}º
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {member.phone && (
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <Phone className="w-3 h-3" />{member.phone}
                          </span>
                        )}
                        {member.last_used_at && (
                          <span className="text-xs text-gray-400">
                            Último acesso {new Date(member.last_used_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {member.notes && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{member.notes}</p>
                      )}
                    </div>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : member.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition shrink-0"
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs font-bold text-gray-700">{tickets.length}</span>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      }
                    </button>

                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${
                      member.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {member.is_active ? 'Ativa' : 'Inativa'}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditForm(member)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`p-2 rounded-lg transition ${
                          member.is_active
                            ? 'hover:bg-red-50 text-gray-500 hover:text-red-600'
                            : 'hover:bg-emerald-50 text-gray-500 hover:text-emerald-600'
                        }`}
                        title={member.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {member.is_active ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setConfirmDelete(member.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                        Chamados reportados ({tickets.length})
                      </p>
                      {tickets.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-3">Nenhum chamado reportado ainda.</p>
                      ) : (
                        tickets.slice(0, 5).map(t => (
                          <div key={t.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CLASS[t.status] ?? STATUS_CLASS.open}`}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">{t.title}</p>
                              <p className="text-xs text-gray-500">
                                UH {t.room_number ?? '—'} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                      {tickets.length > 5 && (
                        <p className="text-xs text-gray-400 text-center pt-1">+{tickets.length - 5} chamado{tickets.length - 5 !== 1 ? 's' : ''} mais antigo{tickets.length - 5 !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingId ? 'Editar Camareira' : 'Nova Camareira'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Andar principal</label>
                <select
                  value={formFloor}
                  onChange={e => setFormFloor(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                >
                  {Array.from({ length: 7 }, (_, i) => i + 1).map(f => (
                    <option key={f} value={f}>{f}º Andar</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                  PIN {editingId ? '(deixe vazio para manter o atual)' : '(4 dígitos)'}
                </label>
                <input
                  type="password"
                  value={formPin}
                  onChange={e => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone (opcional)</span>
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="Ex: (22) 99999-0000"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Observações (opcional)</span>
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Ex: cobre andares 2 e 3 nas quartas"
                  rows={2}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
                />
              </div>

              {formError && (
                <div className="flex gap-2 items-start p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition disabled:bg-gray-300"
              >
                {saving ? 'Salvando...' : (editingId ? 'Salvar' : 'Cadastrar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir camareira?</h3>
            <p className="text-sm text-gray-600 mb-6">Esta ação não pode ser desfeita. O PIN será invalidado.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance / Bonus tab
// ─────────────────────────────────────────────────────────────────────────────

type BonusReport = {
  id: string;
  status_reason: string | null;
  created_at: string;
  rating: number | null;
};

type BonusView = 'monthly' | 'weekly';

function extractCamareiraName(statusReason: string | null): string | null {
  if (!statusReason) return null;
  const m = statusReason.match(/^Reportado por:\s*(.+?)(\s*\(|$)/);
  return m?.[1]?.trim() ?? null;
}

function HousekeepingPerformanceTab() {
  const [reports, setReports] = useState<BonusReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<BonusView>('monthly');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id, status_reason, created_at, rating')
      .ilike('status_reason', 'Reportado por:%')
      .gte('created_at', yearStart)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) {
      console.error('Erro carregando desempenho:', error);
      setLoading(false);
      return;
    }
    setReports((data ?? []) as BonusReport[]);
    setLoading(false);
  }

  const monthlyData = useMemo(() => {
    const monthSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};
    const ratingsByPerson: Record<string, number[]> = {};

    for (const r of reports) {
      const name = extractCamareiraName(r.status_reason);
      if (!name) continue;
      const date = new Date(r.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(key);
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][key] = (byPerson[name][key] ?? 0) + 1;
      if (r.rating) {
        if (!ratingsByPerson[name]) ratingsByPerson[name] = [];
        ratingsByPerson[name].push(r.rating);
      }
    }

    const months = Array.from(monthSet).sort();
    const PT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const monthLabels = months.map(m => {
      const [y, mo] = m.split('-');
      return `${PT_MONTHS[Number(mo) - 1]}/${y.slice(2)}`;
    });

    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = Object.values(byPerson[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(byPerson[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    });

    return { months, monthLabels, byPerson, people, ratingsByPerson };
  }, [reports]);

  const weeklyData = useMemo(() => {
    function isoWeek(date: Date): string {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    const weekSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};

    for (const r of reports) {
      const name = extractCamareiraName(r.status_reason);
      if (!name) continue;
      const wk = isoWeek(new Date(r.created_at));
      weekSet.add(wk);
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][wk] = (byPerson[name][wk] ?? 0) + 1;
    }

    const weeks = Array.from(weekSet).sort().slice(-12);
    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = weeks.reduce((s, w) => s + (byPerson[a]?.[w] ?? 0), 0);
      const tb = weeks.reduce((s, w) => s + (byPerson[b]?.[w] ?? 0), 0);
      return tb - ta;
    });

    return { weeks, byPerson, people };
  }, [reports]);

  const grandTotal = reports.filter(r => extractCamareiraName(r.status_reason)).length;

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Carregando relatório...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Relatório de bonificação</p>
          <p className="text-lg font-black text-gray-900">{grandTotal} chamados reportados em {new Date().getFullYear()}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex max-w-full overflow-x-auto gap-2">
            {(['monthly', 'weekly'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black transition ${view === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {v === 'monthly' ? 'Mensal' : 'Semanal'}
              </button>
            ))}
          </div>
          <button
            onClick={() => printHousekeepingPerformanceReport(view, grandTotal, monthlyData, weeklyData)}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-500 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>
      </div>

      {view === 'monthly' && (
        monthlyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400 min-w-[140px]">Camareira</th>
                  {monthlyData.monthLabels.map(m => (
                    <th key={m} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 min-w-[60px]">{m}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-600 min-w-[70px]">Avaliação</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.people.map((name, i) => {
                  const total = Object.values(monthlyData.byPerson[name]).reduce((s: number, v) => s + Number(v), 0);
                  const ratings = monthlyData.ratingsByPerson[name] ?? [];
                  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-gray-900 text-sm">{name}</td>
                      {monthlyData.months.map(m => {
                        const count = monthlyData.byPerson[name][m] ?? 0;
                        return (
                          <td key={m} className="px-3 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[28px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-2 py-0.5">{count}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                      <td className="px-4 py-3 text-center font-bold text-amber-600">{avgRating ? `⭐ ${avgRating}` : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 bg-gray-100 font-black">
                  <td className="sticky left-0 bg-gray-100 px-4 py-3 text-xs uppercase tracking-widest text-gray-500">TOTAL</td>
                  {monthlyData.months.map(m => {
                    const total = monthlyData.people.reduce((s, name) => s + (monthlyData.byPerson[name][m] ?? 0), 0);
                    return <td key={m} className="px-3 py-3 text-center font-black text-gray-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{grandTotal}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-sm font-bold text-gray-400">
            Nenhum chamado reportado neste ano.
          </div>
        )
      )}

      {view === 'weekly' && (
        weeklyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-gray-400 min-w-[140px]">Camareira</th>
                  {weeklyData.weeks.map(w => (
                    <th key={w} className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 min-w-[52px]">{w.replace(/\d{4}-/, '')}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.people.map((name, i) => {
                  const total = weeklyData.weeks.reduce((s, w) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-gray-900 text-sm">{name}</td>
                      {weeklyData.weeks.map(w => {
                        const count = weeklyData.byPerson[name]?.[w] ?? 0;
                        return (
                          <td key={w} className="px-2 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[24px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-1.5 py-0.5">{count}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 bg-gray-100 font-black">
                  <td className="sticky left-0 bg-gray-100 px-4 py-3 text-xs uppercase tracking-widest text-gray-500">TOTAL</td>
                  {weeklyData.weeks.map(w => {
                    const total = weeklyData.people.reduce((s, name) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                    return <td key={w} className="px-2 py-3 text-center font-black text-gray-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{weeklyData.people.reduce((s, name) => s + weeklyData.weeks.reduce((ws, w) => ws + (weeklyData.byPerson[name]?.[w] ?? 0), 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center text-sm font-bold text-gray-400">
            Nenhum chamado reportado nas últimas 12 semanas.
          </div>
        )
      )}

      <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest">
        Base: chamados reportados via portal PIN · {new Date().getFullYear()}
      </p>
    </div>
  );
}

function printHousekeepingPerformanceReport(
  view: BonusView,
  grandTotal: number,
  monthlyData: { months: string[]; monthLabels: string[]; byPerson: Record<string, Record<string, number>>; people: string[]; ratingsByPerson: Record<string, number[]> },
  weeklyData: { weeks: string[]; byPerson: Record<string, Record<string, number>>; people: string[] },
) {
  const year = new Date().getFullYear();
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  let tableHTML = '';

  if (view === 'monthly') {
    const headerCols = monthlyData.monthLabels
      .map(m => `<th style="padding:8px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:52px">${m}</th>`)
      .join('');

    const bodyRows = monthlyData.people.map((name, i) => {
      const total = Object.values(monthlyData.byPerson[name]).reduce((s: number, v) => s + Number(v), 0);
      const ratings = monthlyData.ratingsByPerson[name] ?? [];
      const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      const dataCols = monthlyData.months.map(m => {
        const count = monthlyData.byPerson[name][m] ?? 0;
        return count > 0
          ? `<td style="padding:8px 10px;text-align:center"><span style="display:inline-block;min-width:24px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:900;font-size:11px;padding:2px 6px">${count}</span></td>`
          : `<td style="padding:8px 10px;text-align:center;color:#d4d4d4;font-size:11px">—</td>`;
      }).join('');
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;font-weight:700;font-size:12px;color:#0a0a0a;border-right:1px solid #e5e5e5">${name}</td>
        ${dataCols}
        <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${total}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#d97706">${avgRating ? `★ ${avgRating}` : '—'}</td>
      </tr>`;
    }).join('');

    const totalRow = monthlyData.months.map(m => {
      const t = monthlyData.people.reduce((s, name) => s + (monthlyData.byPerson[name][m] ?? 0), 0);
      return `<td style="padding:8px 10px;text-align:center;font-weight:900;color:#404040">${t || '—'}</td>`;
    }).join('');

    tableHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f5f5;border-bottom:2px solid #e5e5e5">
            <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:140px;border-right:1px solid #e5e5e5">Camareira</th>
            ${headerCols}
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#16a34a;min-width:56px">TOTAL</th>
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#d97706;min-width:64px">Avaliação</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr style="background:#f5f5f5;border-top:2px solid #d4d4d4">
            <td style="padding:8px 12px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;border-right:1px solid #e5e5e5">TOTAL</td>
            ${totalRow}
            <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${grandTotal}</td>
            <td style="padding:8px 10px"></td>
          </tr>
        </tbody>
      </table>`;
  } else {
    const headerCols = weeklyData.weeks
      .map(w => `<th style="padding:8px 8px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#737373;min-width:44px">${w.replace(/\d{4}-/, '')}</th>`)
      .join('');

    const bodyRows = weeklyData.people.map((name, i) => {
      const total = weeklyData.weeks.reduce((s, w) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      const dataCols = weeklyData.weeks.map(w => {
        const count = weeklyData.byPerson[name]?.[w] ?? 0;
        return count > 0
          ? `<td style="padding:8px 8px;text-align:center"><span style="display:inline-block;min-width:20px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:900;font-size:11px;padding:2px 5px">${count}</span></td>`
          : `<td style="padding:8px 8px;text-align:center;color:#d4d4d4;font-size:11px">—</td>`;
      }).join('');
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;font-weight:700;font-size:12px;color:#0a0a0a;border-right:1px solid #e5e5e5">${name}</td>
        ${dataCols}
        <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${total}</td>
      </tr>`;
    }).join('');

    const weeklyGrandTotal = weeklyData.people.reduce((s, name) => s + weeklyData.weeks.reduce((ws, w) => ws + (weeklyData.byPerson[name]?.[w] ?? 0), 0), 0);
    const totalRow = weeklyData.weeks.map(w => {
      const t = weeklyData.people.reduce((s, name) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
      return `<td style="padding:8px 8px;text-align:center;font-weight:900;color:#404040">${t || '—'}</td>`;
    }).join('');

    tableHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f5f5;border-bottom:2px solid #e5e5e5">
            <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:140px;border-right:1px solid #e5e5e5">Camareira</th>
            ${headerCols}
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#16a34a;min-width:56px">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr style="background:#f5f5f5;border-top:2px solid #d4d4d4">
            <td style="padding:8px 12px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;border-right:1px solid #e5e5e5">TOTAL</td>
            ${totalRow}
            <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${weeklyGrandTotal}</td>
          </tr>
        </tbody>
      </table>`;
  }

  const contentHTML = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#0a0a0a;padding:0;margin:0">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0a0a0a">
        <div>
          <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.28em;color:#d97706;margin:0 0 4px">Royal PMS Enterprise</p>
          <h1 style="font-size:20px;font-weight:900;color:#0a0a0a;margin:0 0 2px">Relatório de Desempenho — Camareiras</h1>
          <p style="font-size:11px;color:#737373;margin:0">${view === 'monthly' ? `Matriz mensal · ${year}` : `Últimas 12 semanas · ${year}`}</p>
        </div>
        <div style="text-align:right">
          <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#737373;margin:0">Emitido em</p>
          <p style="font-size:11px;font-weight:700;color:#0a0a0a;margin:2px 0 0">${now}</p>
          <p style="font-size:9px;color:#737373;margin:4px 0 0">${grandTotal} chamados reportados no ano</p>
        </div>
      </div>
      <div style="border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
        ${tableHTML}
      </div>
      <div style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e5e5;display:flex;justify-content:space-between;align-items:center">
        <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;color:#a3a3a3;margin:0">Base: chamados reportados via portal PIN · ${year}</p>
        <p style="font-size:9px;color:#d4d4d4;margin:0">Royal PMS Enterprise</p>
      </div>
    </div>`;

  const fullHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de Desempenho — Camareiras ${year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0a0a0a; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${contentHTML}</body>
</html>`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;

  if (!isIOS) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(fullHTML);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print failed:', e);
      }
      setTimeout(() => iframe.remove(), 2000);
    };

    if (iframe.contentWindow?.document.readyState === 'complete') {
      setTimeout(triggerPrint, 200);
    } else {
      iframe.onload = () => setTimeout(triggerPrint, 200);
      setTimeout(triggerPrint, 800);
    }
    return;
  }

  const OVERLAY_ID = 'royal-hk-perf-print-overlay';
  const STYLE_ID = 'royal-hk-perf-print-style';
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} { display: none; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#${OVERLAY_ID}) { display: none !important; }
      #${OVERLAY_ID} {
        display: block !important;
        position: static !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = contentHTML;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  setTimeout(() => window.print(), 100);

  const cleanup = () => {
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);
}
