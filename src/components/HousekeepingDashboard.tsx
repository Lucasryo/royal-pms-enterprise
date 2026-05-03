import { type ComponentType, type FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { Room, UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';
import { logAudit } from '../lib/audit';
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Paintbrush,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X as CloseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

const STATUS_LABELS: Record<Room['status'], string> = {
  available: 'Disponivel',
  occupied: 'Ocupada',
  maintenance: 'Manutencao',
  reserved: 'Reservada',
};

const STATUS_STYLES: Record<Room['status'], string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  occupied: 'bg-neutral-900 text-white border-neutral-900',
  maintenance: 'bg-red-50 text-red-700 border-red-200',
  reserved: 'bg-amber-50 text-amber-700 border-amber-200',
};

const HOUSEKEEPING_LABELS: Record<Room['housekeeping_status'], string> = {
  clean: 'Limpa',
  dirty: 'Suja',
  inspected: 'Inspecionada',
  out_of_order: 'Bloqueada',
};

const HOUSEKEEPING_STYLES: Record<Room['housekeeping_status'], string> = {
  clean: 'bg-blue-50 text-blue-700 border-blue-200',
  dirty: 'bg-orange-50 text-orange-700 border-orange-200',
  inspected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  out_of_order: 'bg-red-50 text-red-700 border-red-200',
};

const CATEGORIES = ['executivo', 'master', 'suite presidencial'];

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Sem registro';

export default function HousekeepingDashboard({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageHousekeeping', ['admin', 'manager', 'reception', 'housekeeping', 'maintenance']);
  const isMaintenanceProfile = profile.role === 'maintenance';
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Room['housekeeping_status']>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('1');
  const [category, setCategory] = useState('executivo');

  useEffect(() => {
    fetchRooms();
    const channel = supabase
      .channel('rooms-housekeeping')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchRooms() {
    setLoading(true);
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('floor')
      .order('room_number');

    if (error) {
      toast.error('Erro ao carregar UHs: ' + error.message);
    } else {
      setRooms((data || []) as Room[]);
    }
    setLoading(false);
  }

  const physicalRooms = rooms.filter((room) => !room.is_virtual);
  const floors = (Array.from(new Set(physicalRooms.map((room) => Number(room.floor)))) as number[]).sort(
    (a, b) => a - b,
  );

  const stats = {
    total: physicalRooms.length,
    clean: physicalRooms.filter((room) => room.housekeeping_status === 'clean').length,
    dirty: physicalRooms.filter((room) => room.housekeeping_status === 'dirty').length,
    inspected: physicalRooms.filter((room) => room.housekeeping_status === 'inspected').length,
    blocked: physicalRooms.filter((room) => room.housekeeping_status === 'out_of_order' || room.status === 'maintenance').length,
  };

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return physicalRooms.filter((room) => {
      const matchesSearch =
        !term ||
        room.room_number.toLowerCase().includes(term) ||
        room.category.toLowerCase().includes(term) ||
        room.maintenance_notes?.toLowerCase().includes(term);
      const matchesFloor = floorFilter === 'all' || String(room.floor) === floorFilter;
      const matchesStatus = statusFilter === 'all' || room.housekeeping_status === statusFilter;
      return matchesSearch && matchesFloor && matchesStatus;
    });
  }, [physicalRooms, search, floorFilter, statusFilter]);

  const roomsByFloor = filteredRooms.reduce<Record<string, Room[]>>((acc, room) => {
    const key = String(room.floor);
    acc[key] = acc[key] || [];
    acc[key].push(room);
    return acc;
  }, {});

  async function updateRoom(room: Room, patch: Partial<Room>, action: string) {
    if (!canManage) {
      toast.error('Seu perfil nao pode alterar governanca.');
      return;
    }

    const nextPatch = {
      ...patch,
      last_cleaned_at:
        patch.housekeeping_status === 'clean' || patch.housekeeping_status === 'inspected'
          ? new Date().toISOString()
          : room.last_cleaned_at,
    };

    const { error } = await supabase.from('rooms').update(nextPatch).eq('id', room.id);
    if (error) {
      toast.error('Erro ao atualizar UH: ' + error.message);
      return;
    }

    await logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action,
      details: `UH ${room.room_number}`,
      type: 'update',
    });
    toast.success(`UH ${room.room_number} atualizada.`);
    fetchRooms();
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;

    const payload = {
      room_number: roomNumber.trim(),
      floor: Number(floor),
      category,
      status: 'available',
      housekeeping_status: 'clean',
    };

    if (!payload.room_number || Number.isNaN(payload.floor)) {
      toast.error('Informe UH e andar.');
      return;
    }

    const { error } = await supabase.from('rooms').insert([payload]);
    if (error) {
      toast.error('Erro ao criar UH: ' + error.message);
      return;
    }

    await logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'UH criada',
      details: `UH ${payload.room_number} · ${payload.category}`,
      type: 'create',
    });
    toast.success('UH cadastrada.');
    setModalOpen(false);
    setRoomNumber('');
    fetchRooms();
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Governanca</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {isMaintenanceProfile ? 'Mapa tecnico de UHs, interdicao e liberacao por manutencao' : 'Mapa de UHs, limpeza, inspecao e manutencao'}
          </p>
        </div>
        {canManage && !isMaintenanceProfile && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" />
            Nova UH
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard label="UHs" value={stats.total} icon={BedDouble} tone="neutral" />
        <StatCard label="Limpas" value={stats.clean} icon={Sparkles} tone="blue" />
        <StatCard label="Sujas" value={stats.dirty} icon={Paintbrush} tone="orange" />
        <StatCard label="Inspecionadas" value={stats.inspected} icon={ShieldCheck} tone="green" />
        <StatCard label="Bloqueios" value={stats.blocked} icon={AlertTriangle} tone="red" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar UH, categoria ou observacao"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-neutral-900 focus:bg-white"
          />
        </div>
        <select
          value={floorFilter}
          onChange={(event) => setFloorFilter(event.target.value)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium outline-none"
        >
          <option value="all">Todos os andares</option>
          {floors.map((item) => (
            <option key={item} value={String(item)}>
              {item}o andar
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium outline-none"
        >
          <option value="all">Todos os status</option>
          <option value="dirty">Sujas</option>
          <option value="clean">Limpas</option>
          <option value="inspected">Inspecionadas</option>
          <option value="out_of_order">Bloqueadas</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white py-20 text-center">
          <BedDouble className="mx-auto mb-3 h-10 w-10 text-neutral-200" />
          <p className="font-bold text-neutral-400">Nenhuma UH encontrada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(roomsByFloor)
            .sort((a, b) => Number(a) - Number(b))
            .map((floorKey) => (
              <section key={floorKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-neutral-500">
                    {floorKey}o andar
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">
                    {roomsByFloor[floorKey].length} UHs
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {roomsByFloor[floorKey]
                    .sort((a, b) => a.room_number.localeCompare(b.room_number))
                    .map((room) => (
                      <div key={room.id}>
                        <RoomCard room={room} canManage={canManage} onUpdate={updateRoom} />
                      </div>
                    ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.form
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onSubmit={createRoom}
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 p-6">
                <div>
                  <h3 className="font-black text-neutral-900">Nova UH</h3>
                  <p className="mt-1 text-xs text-neutral-500">Cadastre um quarto no inventario operacional.</p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 hover:bg-neutral-100">
                  <CloseIcon className="h-5 w-5 text-neutral-400" />
                </button>
              </div>
              <div className="space-y-4 p-6">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">UH</span>
                  <input
                    value={roomNumber}
                    onChange={(event) => setRoomNumber(event.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900"
                    placeholder="Ex: 1204"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Andar</span>
                  <input
                    type="number"
                    value={floor}
                    onChange={(event) => setFloor(event.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Categoria</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900"
                  >
                    {CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-3 border-t border-neutral-100 p-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white">
                  Cadastrar
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: 'neutral' | 'blue' | 'orange' | 'green' | 'red';
}) {
  const tones = {
    neutral: 'bg-neutral-50 text-neutral-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl font-black text-neutral-900">{value}</span>
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

function RoomCard({
  room,
  canManage,
  onUpdate,
}: {
  room: Room;
  canManage: boolean;
  onUpdate: (room: Room, patch: Partial<Room>, action: string) => Promise<void> | void;
}) {
  const [notes, setNotes] = useState(room.maintenance_notes || '');
  const isBlocked = room.housekeeping_status === 'out_of_order' || room.status === 'maintenance';

  return (
    <motion.div layout className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-neutral-400" />
            <h3 className="text-lg font-black text-neutral-900">UH {room.room_number}</h3>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {room.category} · {room.floor}o andar
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${STATUS_STYLES[room.status]}`}>
          {STATUS_LABELS[room.status]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${HOUSEKEEPING_STYLES[room.housekeeping_status]}`}>
          {HOUSEKEEPING_LABELS[room.housekeeping_status]}
        </span>
        <span className="rounded-full bg-neutral-50 px-2 py-1 text-[9px] font-bold uppercase text-neutral-400">
          {formatDateTime(room.last_cleaned_at)}
        </span>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={!canManage}
        placeholder="Observacoes de manutencao"
        className="mt-4 min-h-[72px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-neutral-900 disabled:text-neutral-400"
      />

      {canManage && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate(room, { housekeeping_status: 'clean', maintenance_notes: notes }, 'UH limpa')}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            <Sparkles className="h-4 w-4" />
            Limpa
          </button>
          <button
            onClick={() => onUpdate(room, { housekeeping_status: 'inspected', maintenance_notes: notes }, 'UH inspecionada')}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <ClipboardCheck className="h-4 w-4" />
            Inspecionar
          </button>
          <button
            onClick={() => onUpdate(room, { housekeeping_status: 'dirty', maintenance_notes: notes }, 'UH marcada como suja')}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100"
          >
            <Paintbrush className="h-4 w-4" />
            Suja
          </button>
          <button
            onClick={() =>
              onUpdate(
                room,
                {
                  status: isBlocked ? 'available' : 'maintenance',
                  housekeeping_status: isBlocked ? 'dirty' : 'out_of_order',
                  maintenance_notes: notes,
                },
                isBlocked ? 'UH liberada' : 'UH bloqueada para manutencao',
              )
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            {isBlocked ? <CheckCircle2 className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
            {isBlocked ? 'Liberar' : 'Bloquear'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
