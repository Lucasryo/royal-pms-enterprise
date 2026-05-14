import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { Reservation, UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';

type FiscalJob = {
  id: string;
  reservation_code?: string;
  document_type: 'nfse' | 'rps' | 'invoice';
  status: 'pending' | 'processing' | 'issued' | 'error' | 'cancelled';
  amount: number;
  error_message?: string;
  created_at: string;
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
      {label}
    </div>
  );
}

export default function FiscalPanelDashboard({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageProfessionalTools', ['admin', 'manager', 'finance', 'faturamento']);
  const loaded = useRef(false);

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<FiscalJob[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [jobsRes, resRes] = await Promise.all([
      supabase.from('fiscal_jobs').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('reservations').select('*').limit(30),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data as FiscalJob[]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    setLoading(false);
  }

  async function enqueue(reservation: Reservation) {
    const { error } = await supabase.from('fiscal_jobs').insert([{
      reservation_code: reservation.reservation_code,
      document_type: 'nfse',
      status: 'pending',
      amount: reservation.total_amount || 0,
      payload: { guest_name: reservation.guest_name, company_id: reservation.company_id },
    }]);
    if (error) { toast.error('Erro ao criar fila fiscal: ' + error.message); return; }
    toast.success('Documento fiscal enviado para fila.');
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
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Fila NFS-e/RPS</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Controle de emissao, erro, reenvio e cancelamento fiscal. A integracao municipal entra por worker/API dedicada.</p>
        <div className="mt-5 space-y-3">
          {jobs.length === 0 ? <Empty label="Fila fiscal vazia." /> : jobs.map((job) => (
            <div key={job.id} className="rounded-2xl bg-neutral-50 p-4">
              <p className="font-black text-neutral-900">{job.document_type.toUpperCase()} {job.reservation_code || ''}</p>
              <p className="mt-1 text-sm text-neutral-500">{job.status} - {money(Number(job.amount || 0))}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Reservas para emissao</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Base para gerar NFS-e/RPS apos checkout ou faturamento.</p>
        <div className="mt-5 space-y-3">
          {reservations.slice(0, 12).map((reservation) => (
            <div key={reservation.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4">
              <div>
                <p className="font-black text-neutral-900">{reservation.reservation_code}</p>
                <p className="text-sm text-neutral-500">{reservation.guest_name} - {money(Number(reservation.total_amount || 0))}</p>
              </div>
              <button disabled={!canManage} onClick={() => enqueue(reservation)} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Fila fiscal</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
