import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCompanyScope } from '@/lib/useCompanyScope';
import { computeExpiry, formatDateTime, toLocalInputValue } from '@/lib/dates';
import {
  STORAGE_CONDITION_LABELS,
  type ProductWithShelfLives,
  type StorageCondition,
} from '@/lib/types';
import { LabelPreview, type LabelData } from '@/components/LabelPreview';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';

interface LabelSize {
  id: string;
  label: string;
  w: number;
  h: number;
}

const LABEL_SIZES: LabelSize[] = [
  { id: '40x60', label: '40 x 60 mm', w: 40, h: 60 },
  { id: '60x40', label: '60 x 40 mm', w: 60, h: 40 },
  { id: '50x30', label: '50 x 30 mm', w: 50, h: 30 },
  { id: '33x22', label: '33 x 22 mm', w: 33, h: 22 },
];

function applyPageStyle(w: number, h: number) {
  let el = document.getElementById('print-page-style') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'print-page-style';
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
}

export function PrintLabelPage() {
  const { profile } = useAuth();
  const { isMaster, companies, companyId, setCompanyId, companyName } =
    useCompanyScope();

  const [products, setProducts] = useState<ProductWithShelfLives[]>([]);
  const [loading, setLoading] = useState(true);

  const [productId, setProductId] = useState('');
  const [condition, setCondition] = useState<StorageCondition>('refrigerado');
  const [manipulationLocal, setManipulationLocal] = useState(() =>
    toLocalInputValue(new Date()),
  );
  const [responsible, setResponsible] = useState(profile?.full_name ?? '');
  const [quantity, setQuantity] = useState(1);
  const [sizeId, setSizeId] = useState(LABEL_SIZES[0].id);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('products')
      .select('*, product_shelf_lives(*)')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name')
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          toast.error('Erro ao carregar produtos: ' + error.message);
          return;
        }
        setProducts((data as ProductWithShelfLives[] | null) ?? []);
      });
  }, [companyId]);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const rules = selectedProduct?.product_shelf_lives ?? [];

  useEffect(() => {
    if (!selectedProduct) return;
    const has = (c: StorageCondition) =>
      rules.some((r) => r.storage_condition === c);
    if (has(selectedProduct.default_storage_condition)) {
      setCondition(selectedProduct.default_storage_condition);
    } else if (rules.length > 0) {
      setCondition(rules[0].storage_condition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const rule = rules.find((r) => r.storage_condition === condition) ?? null;
  const manipDate = manipulationLocal ? new Date(manipulationLocal) : null;
  const manipValid = manipDate !== null && !Number.isNaN(manipDate.getTime());
  const expiry =
    manipValid && rule
      ? computeExpiry(manipDate, rule.validity_value, rule.validity_unit)
      : null;

  const size = LABEL_SIZES.find((s) => s.id === sizeId) ?? LABEL_SIZES[0];

  const labelData: LabelData = {
    companyName,
    productName: selectedProduct?.name ?? '',
    storageConditionLabel: STORAGE_CONDITION_LABELS[condition],
    manipulationText: manipValid ? formatDateTime(manipDate) : '',
    expiryText: expiry ? formatDateTime(expiry) : '',
    responsibleName: responsible,
  };

  const canPrint =
    Boolean(selectedProduct) &&
    rule !== null &&
    expiry !== null &&
    responsible.trim().length > 0 &&
    quantity >= 1;

  async function handlePrint() {
    if (!canPrint || !selectedProduct || !rule || !expiry || !manipDate) {
      toast.error('Preencha produto, condicao, data e responsavel.');
      return;
    }
    setPrinting(true);
    applyPageStyle(size.w, size.h);
    window.print();

    const { error } = await supabase.from('label_prints').insert({
      company_id: companyId,
      product_id: selectedProduct.id,
      product_name_snapshot: selectedProduct.name,
      storage_condition: condition,
      manipulation_at: manipDate.toISOString(),
      expiry_at: expiry.toISOString(),
      responsible_name: responsible.trim(),
      quantity,
      printed_by: profile?.id ?? null,
    });
    setPrinting(false);
    if (error) {
      toast.error('Etiqueta enviada, mas o registro falhou: ' + error.message);
      return;
    }
    toast.success('Etiqueta enviada para impressao.');
  }

  const noCompany = isMaster && companies.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-neutral-800 sm:text-2xl">
          Imprimir Etiqueta
        </h1>
        <p className="text-sm text-neutral-500">
          A etiqueta sai no tamanho exato pela impressora termica.
        </p>
      </div>

      {noCompany ? (
        <Card>
          <p className="text-sm text-neutral-600">
            Nenhuma empresa cadastrada. Crie uma empresa para comecar.
          </p>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Card>
            <div className="flex flex-col gap-4">
              {isMaster && companies.length > 0 && (
                <Select
                  label="Empresa"
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setProductId('');
                  }}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}

              <Select
                label="Produto"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Selecione um produto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>

              {selectedProduct && rules.length === 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Este produto nao tem regras de validade. Cadastre em Produtos.
                </p>
              )}

              <Select
                label="Condicao de armazenamento"
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as StorageCondition)
                }
                disabled={rules.length === 0}
              >
                {rules.map((r) => (
                  <option key={r.storage_condition} value={r.storage_condition}>
                    {STORAGE_CONDITION_LABELS[r.storage_condition]} —{' '}
                    {r.validity_value}{' '}
                    {r.validity_unit === 'hours' ? 'horas' : 'dias'}
                  </option>
                ))}
              </Select>

              <Input
                id="manip"
                label="Data e hora da manipulacao / abertura"
                type="datetime-local"
                value={manipulationLocal}
                onChange={(e) => setManipulationLocal(e.target.value)}
              />

              <Input
                id="resp"
                label="Responsavel"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder="Nome de quem manipulou"
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="qty"
                  label="Quantidade"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <Select
                  label="Tamanho da etiqueta"
                  value={sizeId}
                  onChange={(e) => setSizeId(e.target.value)}
                >
                  {LABEL_SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Button onClick={handlePrint} disabled={!canPrint} loading={printing}>
                <Printer size={18} />
                Imprimir {quantity > 1 ? `${quantity} etiquetas` : 'etiqueta'}
              </Button>
              <p className="text-xs text-neutral-400">
                Configure o driver da impressora uma vez: papel no tamanho da
                etiqueta, margens zero e escala 100%.
              </p>
            </div>
          </Card>

          <Card className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-neutral-700">Previa</p>
            <LabelPreview data={labelData} widthMm={size.w} heightMm={size.h} />
            {expiry && (
              <p className="text-xs text-neutral-500">
                Validade calculada: {formatDateTime(expiry)}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Area exclusiva de impressao: fora da tela, revelada pelo @media print */}
      <div id="print-label-area" className="absolute -left-[9999px] top-0">
        {Array.from({ length: quantity }).map((_, i) => (
          <div
            key={i}
            style={{ breakAfter: i < quantity - 1 ? 'page' : 'auto' }}
          >
            <LabelPreview data={labelData} widthMm={size.w} heightMm={size.h} />
          </div>
        ))}
      </div>
    </div>
  );
}
