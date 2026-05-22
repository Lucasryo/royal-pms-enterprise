import { useEffect, useState } from 'react';
import { Package, Printer, Images, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

async function countRows(table: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

interface Stats {
  products: number;
  prints: number;
  photos: number;
  companies: number;
}

export function DashboardPage() {
  const { isMaster, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      countRows('products'),
      countRows('label_prints'),
      countRows('photos'),
      isMaster ? countRows('companies') : Promise.resolve(0),
    ]).then(([products, prints, photos, companies]) => {
      if (!cancelled) setStats({ products, prints, photos, companies });
    });
    return () => {
      cancelled = true;
    };
  }, [isMaster]);

  const cards: { label: string; value: number; icon: LucideIcon; show: boolean }[] =
    [
      { label: 'Produtos', value: stats?.products ?? 0, icon: Package, show: true },
      {
        label: 'Etiquetas impressas',
        value: stats?.prints ?? 0,
        icon: Printer,
        show: true,
      },
      { label: 'Fotos', value: stats?.photos ?? 0, icon: Images, show: true },
      {
        label: 'Empresas',
        value: stats?.companies ?? 0,
        icon: Building2,
        show: isMaster,
      },
    ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-neutral-800 sm:text-2xl">
          Painel
        </h1>
        <p className="text-sm text-neutral-500">
          Ola, {profile?.full_name ?? profile?.email}.
          {isMaster
            ? ' Voce ve os dados de todas as empresas.'
            : ' Resumo da sua empresa.'}
        </p>
      </div>

      {!stats ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {cards
            .filter((c) => c.show)
            .map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold text-neutral-800">
                      {value}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{label}</p>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
