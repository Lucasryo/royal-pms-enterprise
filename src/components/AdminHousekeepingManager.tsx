import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Plus, Trash2, Edit2, Key, Users, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Phone, FileText, ClipboardList } from 'lucide-react';

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
  open: 'bg-amber-500/20 text-amber-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-neutral-500/20 text-neutral-400',
};

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function AdminHousekeepingManager() {
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

  // Group staff by floor
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            Camareiras
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            {staff.filter(s => s.is_active).length} ativas · {staff.length} cadastradas
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-neutral-900 font-bold px-4 py-2 rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          Nova Camareira
        </button>
      </div>

      {/* Empty state */}
      {staff.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <Key className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">Nenhuma camareira cadastrada.</p>
          <p className="text-sm text-neutral-500 mt-1">Clique em "Nova Camareira" para começar.</p>
        </div>
      )}

      {/* Staff grouped by floor */}
      {floors.map(floor => (
        <div key={floor} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{floor}º Andar</span>
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-bold text-neutral-600">{byFloor[floor].length} camareira{byFloor[floor].length !== 1 ? 's' : ''}</span>
          </div>

          <div className="grid gap-2">
            {byFloor[floor].map(member => {
              const tickets = ticketsByStaff[member.name] ?? [];
              const isExpanded = expandedId === member.id;
              return (
                <div
                  key={member.id}
                  className={`bg-white/5 border rounded-xl transition ${
                    member.is_active ? 'border-white/10' : 'border-red-500/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 p-4">
                    {/* Floor badge */}
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${
                      member.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {member.floor_number}º
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{member.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {member.phone && (
                          <span className="text-xs text-neutral-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />{member.phone}
                          </span>
                        )}
                        {member.last_used_at && (
                          <span className="text-xs text-neutral-500">
                            Último acesso {new Date(member.last_used_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {member.notes && (
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">{member.notes}</p>
                      )}
                    </div>

                    {/* Ticket count + expand */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : member.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition shrink-0"
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs font-bold text-neutral-300">{tickets.length}</span>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                        : <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                      }
                    </button>

                    {/* Status badge */}
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${
                      member.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {member.is_active ? 'Ativa' : 'Inativa'}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditForm(member)} className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`p-2 rounded-lg transition ${
                          member.is_active
                            ? 'hover:bg-red-500/20 text-neutral-400 hover:text-red-400'
                            : 'hover:bg-emerald-500/20 text-neutral-400 hover:text-emerald-400'
                        }`}
                        title={member.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {member.is_active ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setConfirmDelete(member.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded tickets */}
                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">
                        Chamados reportados ({tickets.length})
                      </p>
                      {tickets.length === 0 ? (
                        <p className="text-sm text-neutral-500 text-center py-3">Nenhum chamado reportado ainda.</p>
                      ) : (
                        tickets.slice(0, 5).map(t => (
                          <div key={t.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CLASS[t.status] ?? STATUS_CLASS.open}`}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{t.title}</p>
                              <p className="text-xs text-neutral-500">
                                UH {t.room_number ?? '—'} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                      {tickets.length > 5 && (
                        <p className="text-xs text-neutral-500 text-center pt-1">+{tickets.length - 5} chamado{tickets.length - 5 !== 1 ? 's' : ''} mais antigo{tickets.length - 5 !== 1 ? 's' : ''}</p>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingId ? 'Editar Camareira' : 'Nova Camareira'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">Andar principal</label>
                <select
                  value={formFloor}
                  onChange={e => setFormFloor(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {Array.from({ length: 7 }, (_, i) => i + 1).map(f => (
                    <option key={f} value={f} className="bg-neutral-900">{f}º Andar</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">
                  PIN {editingId ? '(deixe vazio para manter o atual)' : '(4 dígitos)'}
                </label>
                <input
                  type="password"
                  value={formPin}
                  onChange={e => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400 text-center text-2xl tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone (opcional)</span>
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="Ex: (22) 99999-0000"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Observações (opcional)</span>
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Ex: cobre andares 2 e 3 nas quartas"
                  rows={2}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {formError && (
                <div className="flex gap-2 items-start p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{formError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-900 font-bold rounded-xl transition disabled:bg-neutral-600"
              >
                {saving ? 'Salvando...' : (editingId ? 'Salvar' : 'Cadastrar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Excluir camareira?</h3>
            <p className="text-sm text-neutral-400 mb-6">Esta ação não pode ser desfeita. O PIN será invalidado.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
