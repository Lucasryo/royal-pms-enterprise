import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Coffee, CreditCard, Loader2, Plus, Receipt, Trash2, Utensils } from 'lucide-react';
import { supabase } from '../supabase';
import { Reservation, UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';
import { toast } from 'sonner';

type PosMenuItem = {
  id: string;
  name: string;
  category: 'food' | 'beverage' | 'service' | 'other';
  price: number;
  active: boolean;
};

type PosOrder = {
  id: string;
  reservation_id?: string;
  room_number?: string;
  guest_name?: string;
  status: 'open' | 'posted' | 'paid' | 'cancelled';
  payment_method: 'room' | 'cash' | 'card' | 'pix';
  subtotal: number;
  created_at: string;
};

type CartLine = PosMenuItem & { quantity: number };

type FolioCharge = {
  id: string;
  reservation_id: string;
  room_number?: string;
  charge_date: string;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  charge_type: 'diaria' | 'servico' | 'alimento' | 'bebida' | 'lavanderia' | 'estorno' | 'outro';
};

const categoryLabels: Record<PosMenuItem['category'], string> = {
  food: 'Alimentos',
  beverage: 'Bebidas',
  service: 'Servicos',
  other: 'Outros',
};

const paymentLabels: Record<PosOrder['payment_method'], string> = {
  room: 'Lancado no quarto',
  cash: 'Dinheiro',
  card: 'Cartao',
  pix: 'Pix',
};

export default function POSDashboard({ profile }: { profile: UserProfile }) {
  const [menuItems, setMenuItems] = useState<PosMenuItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [folioCharges, setFolioCharges] = useState<FolioCharge[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [folioReservationId, setFolioReservationId] = useState('');
  const [targetTransferReservationId, setTargetTransferReservationId] = useState('');
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [transferReason, setTransferReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosOrder['payment_method']>('room');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'food' as PosMenuItem['category'],
    price: '',
  });

  const canManagePOS = hasPermission(profile, 'canManagePOS', ['admin', 'reception', 'restaurant']);
  const canTransferCharges = hasPermission(profile, 'canTransferCharges', ['admin', 'reception', 'faturamento', 'finance', 'restaurant']);

  useEffect(() => {
    fetchData();
    const orderChannel = supabase.channel('pos-orders-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders' }, fetchData).subscribe();
    const folioChannel = supabase.channel('pos-folio-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'folio_charges' }, fetchData).subscribe();
    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(folioChannel);
    };
  }, []);

  async function fetchData() {
    setLoading(true);
    const [itemsResult, reservationsResult, ordersResult, folioResult] = await Promise.all([
      supabase.from('pos_menu_items').select('*').eq('active', true).order('category').order('name'),
      supabase.from('reservations').select('*').eq('status', 'CHECKED_IN').order('room_number'),
      supabase.from('pos_orders').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('folio_charges').select('*').order('created_at', { ascending: false }),
    ]);

    if (itemsResult.data) setMenuItems(itemsResult.data as PosMenuItem[]);
    if (reservationsResult.data) setReservations(reservationsResult.data as Reservation[]);
    if (ordersResult.data) setOrders(ordersResult.data as PosOrder[]);
    if (folioResult.data) setFolioCharges(folioResult.data as FolioCharge[]);
    setLoading(false);
  }

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const selectedReservation = reservations.find((reservation) => reservation.id === selectedReservationId);
  const folioReservation = reservations.find((reservation) => reservation.id === folioReservationId);
  const folioLines = folioReservationId ? folioCharges.filter((charge) => charge.reservation_id === folioReservationId) : [];
  const folioTotal = folioLines.reduce((sum, charge) => sum + Number(charge.total_value || 0), 0);
  const categorySummary = menuItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  function addToCart(item: PosMenuItem) {
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (existing) {
        return current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart((current) => current
      .map((line) => line.id === itemId ? { ...line, quantity: line.quantity - 1 } : line)
      .filter((line) => line.quantity > 0));
  }

  function toggleCharge(chargeId: string) {
    setSelectedChargeIds((current) => {
      const next = new Set(current);
      if (next.has(chargeId)) {
        next.delete(chargeId);
      } else {
        next.add(chargeId);
      }
      return next;
    });
  }

  async function transferSelectedCharges() {
    if (!canTransferCharges) {
      toast.error('Seu perfil nao pode transferir lancamentos entre folios.');
      return;
    }
    if (selectedChargeIds.size === 0) {
      toast.error('Selecione pelo menos um lancamento.');
      return;
    }
    if (!targetTransferReservationId || targetTransferReservationId === folioReservationId) {
      toast.error('Selecione um folio destino diferente da origem.');
      return;
    }
    if (!transferReason.trim()) {
      toast.error('Informe o motivo da transferencia.');
      return;
    }

    const target = reservations.find((reservation) => reservation.id === targetTransferReservationId);
    const { error } = await supabase
      .from('folio_charges')
      .update({
        reservation_id: targetTransferReservationId,
        room_number: target?.room_number || null,
      })
      .in('id', Array.from(selectedChargeIds));

    if (error) {
      toast.error('Erro ao transferir lancamentos.');
      return;
    }

    toast.success(`${selectedChargeIds.size} lancamento(s) transferido(s).`);
    setSelectedChargeIds(new Set());
    setTargetTransferReservationId('');
    setTransferReason('');
    fetchData();
  }

  async function createMenuItem(event: FormEvent) {
    event.preventDefault();
    if (!canManagePOS) return;
    const price = Number(newItem.price);
    if (!newItem.name.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error('Informe nome e preco valido.');
      return;
    }

    const { error } = await supabase.from('pos_menu_items').insert([{
      name: newItem.name.trim(),
      category: newItem.category,
      price,
      active: true,
      created_by: profile.id,
    }]);

    if (error) {
      toast.error('Erro ao cadastrar item.');
      return;
    }

    toast.success('Item adicionado ao cardapio.');
    setNewItem({ name: '', category: 'food', price: '' });
    fetchData();
  }

  async function postOrder() {
    if (!canManagePOS) {
      toast.error('Seu perfil nao pode fechar pedidos no POS.');
      return;
    }
    if (cart.length === 0) {
      toast.error('Adicione itens ao carrinho.');
      return;
    }
    if (paymentMethod === 'room' && !selectedReservation) {
      toast.error('Selecione uma hospedagem em andamento para lancar no quarto.');
      return;
    }
    if (paymentMethod !== 'room' && !guestName.trim()) {
      toast.error('Informe um cliente/mesa para pagamento direto.');
      return;
    }

    setPosting(true);
    try {
      const orderPayload = {
        reservation_id: selectedReservation?.id || null,
        room_number: selectedReservation?.room_number || null,
        guest_name: selectedReservation?.guest_name || guestName.trim(),
        status: paymentMethod === 'room' ? 'posted' : 'paid',
        payment_method: paymentMethod,
        subtotal: cartTotal,
        created_by: profile.id,
      };

      const { data: order, error: orderError } = await supabase
        .from('pos_orders')
        .insert([orderPayload])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((line) => ({
        order_id: order.id,
        menu_item_id: line.id,
        item_name: line.name,
        category: line.category,
        quantity: line.quantity,
        unit_price: line.price,
      }));

      const { error: itemsError } = await supabase.from('pos_order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      if (paymentMethod === 'room' && selectedReservation) {
        const folioItems = cart.map((line) => ({
          reservation_id: selectedReservation.id,
          room_number: selectedReservation.room_number,
          description: `POS Restaurante - ${line.name}`,
          quantity: line.quantity,
          unit_value: line.price,
          charge_type: line.category === 'beverage' ? 'bebida' : line.category === 'food' ? 'alimento' : 'servico',
          posted_by: profile.id,
        }));
        const { error: folioError } = await supabase.from('folio_charges').insert(folioItems);
        if (folioError) throw folioError;
      }

      toast.success(paymentMethod === 'room' ? 'Consumo lancado no quarto.' : 'Venda registrada como paga.');
      setCart([]);
      setGuestName('');
      setSelectedReservationId('');
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel fechar o pedido.');
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600">POS Restaurante</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-950">Consumo de restaurante, bar e room service</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Registre vendas diretas ou lance automaticamente itens de alimento e bebida na conta corrente da hospedagem.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Itens ativos" value={menuItems.length} />
          <Metric label="Hospedes in-house" value={reservations.length} />
          <Metric label="Pedidos hoje" value={orders.filter((order) => order.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Cardapio operacional</p>
                <h2 className="mt-1 text-xl font-black text-neutral-950">Itens para lancamento rapido</h2>
              </div>
              <Utensils className="h-6 w-6 text-amber-600" />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="group rounded-3xl border border-neutral-200 bg-neutral-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:shadow-lg hover:shadow-amber-950/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-neutral-950">{item.name}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">{categoryLabels[item.category as keyof typeof categoryLabels]}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700 shadow-sm">
                      {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-neutral-500 group-hover:text-amber-700">
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </div>
                </button>
              ))}
            </div>
          </div>

          {canManagePOS && (
            <form onSubmit={createMenuItem} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Gestao de cardapio</p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
                <input
                  value={newItem.name}
                  onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-amber-500"
                  placeholder="Nome do item"
                />
                <select
                  value={newItem.category}
                  onChange={(event) => setNewItem({ ...newItem, category: event.target.value as PosMenuItem['category'] })}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-amber-500"
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newItem.price}
                  onChange={(event) => setNewItem({ ...newItem, price: event.target.value })}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-amber-500"
                  placeholder="Preco"
                />
                <button className="rounded-2xl bg-neutral-950 px-5 text-sm font-bold text-white">Salvar</button>
              </div>
            </form>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Comanda</p>
                <h2 className="mt-1 text-xl font-black text-neutral-950">Fechamento do pedido</h2>
              </div>
              <Receipt className="h-6 w-6 text-neutral-500" />
            </div>

            <div className="mt-5 space-y-3">
              {cart.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-400">
                  Selecione itens do cardapio para iniciar uma comanda.
                </div>
              ) : cart.map((line) => (
                <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{line.quantity}x {line.name}</p>
                    <p className="text-xs text-neutral-500">{(line.price * line.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <button onClick={() => removeFromCart(line.id)} className="rounded-xl p-2 text-neutral-400 transition hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-3xl bg-stone-950 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Total</p>
              <p className="mt-2 text-4xl font-black">{cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('room')}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${paymentMethod === 'room' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-neutral-200 bg-white text-neutral-600'}`}
              >
                Lancar no quarto
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${paymentMethod !== 'room' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-neutral-200 bg-white text-neutral-600'}`}
              >
                Pagamento direto
              </button>
            </div>

            {paymentMethod === 'room' ? (
              <select
                value={selectedReservationId}
                onChange={(event) => setSelectedReservationId(event.target.value)}
                className="mt-4 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-amber-500"
              >
                <option value="">Selecione hospedagem em andamento</option>
                {reservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    UH {reservation.room_number || '--'} - {reservation.guest_name} ({reservation.reservation_code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  placeholder="Mesa, cliente ou evento"
                />
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PosOrder['payment_method'])}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="card">Cartao</option>
                  <option value="cash">Dinheiro</option>
                  <option value="pix">Pix</option>
                </select>
              </div>
            )}

            <button
              onClick={postOrder}
              disabled={posting || !canManagePOS}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-700 px-5 text-sm font-black text-white shadow-lg shadow-amber-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Fechar pedido
            </button>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Folio do hospede</p>
                <h2 className="mt-1 text-xl font-black text-neutral-950">Consulta e transferencia</h2>
              </div>
              <ArrowRightLeft className="h-6 w-6 text-orange-600" />
            </div>

            <select
              value={folioReservationId}
              onChange={(event) => {
                setFolioReservationId(event.target.value);
                setSelectedChargeIds(new Set());
                setTargetTransferReservationId('');
              }}
              className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="">Selecione um folio para consultar</option>
              {reservations.map((reservation) => (
                <option key={reservation.id} value={reservation.id}>
                  UH {reservation.room_number || '--'} - {reservation.guest_name} ({reservation.reservation_code})
                </option>
              ))}
            </select>

            {folioReservation && (
              <div className="mt-4 rounded-3xl bg-orange-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">Folio selecionado</p>
                <p className="mt-1 text-sm font-black text-neutral-950">
                  UH {folioReservation.room_number || '--'} - {folioReservation.guest_name}
                </p>
                <p className="mt-2 text-2xl font-black text-orange-800">
                  {folioTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            )}

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {!folioReservationId ? (
                <p className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-400">
                  Consulte uma hospedagem para revisar alimentos, bebidas, servicos e ajustes.
                </p>
              ) : folioLines.length === 0 ? (
                <p className="rounded-3xl bg-neutral-50 p-6 text-center text-sm text-neutral-400">Nenhum lancamento neste folio.</p>
              ) : folioLines.map((charge) => (
                <label key={charge.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-3 transition hover:bg-white">
                  <input
                    type="checkbox"
                    checked={selectedChargeIds.has(charge.id)}
                    onChange={() => toggleCharge(charge.id)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-orange-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-neutral-900">{charge.description}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                      {charge.charge_type} - {new Date(`${charge.charge_date}T12:00:00`).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <p className="text-sm font-black text-neutral-950">
                    {Number(charge.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </label>
              ))}
            </div>

            {folioReservationId && (
              <div className="mt-5 space-y-3 rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Transferir lancamentos selecionados</p>
                <select
                  value={targetTransferReservationId}
                  onChange={(event) => setTargetTransferReservationId(event.target.value)}
                  disabled={!canTransferCharges}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                >
                  <option value="">Folio destino</option>
                  {reservations
                    .filter((reservation) => reservation.id !== folioReservationId)
                    .map((reservation) => (
                      <option key={reservation.id} value={reservation.id}>
                        UH {reservation.room_number || '--'} - {reservation.guest_name}
                      </option>
                    ))}
                </select>
                <input
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  disabled={!canTransferCharges}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                  placeholder="Motivo da transferencia"
                />
                <button
                  type="button"
                  onClick={transferSelectedCharges}
                  disabled={!canTransferCharges || selectedChargeIds.size === 0}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Transferir {selectedChargeIds.size || ''} lancamento{selectedChargeIds.size === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Movimento recente</p>
                <h2 className="mt-1 text-xl font-black text-neutral-950">Ultimos pedidos</h2>
              </div>
              <Coffee className="h-6 w-6 text-amber-700" />
            </div>
            <div className="mt-5 space-y-3">
              {orders.length === 0 ? (
                <p className="rounded-3xl bg-neutral-50 p-6 text-center text-sm text-neutral-400">Nenhum pedido registrado.</p>
              ) : orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{order.guest_name || 'Cliente avulso'}</p>
                      <p className="mt-1 text-xs text-neutral-500">{order.room_number ? `UH ${order.room_number}` : paymentLabels[order.payment_method as keyof typeof paymentLabels]}</p>
                    </div>
                    <p className="text-sm font-black text-neutral-950">{Number(order.subtotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Object.entries(categorySummary).map(([category, count]) => (
              <div key={category} className="rounded-3xl border border-neutral-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">{categoryLabels[category as PosMenuItem['category']]}</p>
                <p className="mt-2 text-2xl font-black text-neutral-950">{count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 rounded-3xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-neutral-950">{value}</p>
    </div>
  );
}
