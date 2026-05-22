export interface LabelData {
  companyName: string;
  productName: string;
  storageConditionLabel: string;
  manipulationText: string;
  expiryText: string;
  responsibleName: string;
}

interface LabelPreviewProps {
  data: LabelData;
  widthMm: number;
  heightMm: number;
}

/**
 * Etiqueta de validade de alimento, dimensionada em milimetros para sair
 * no tamanho exato pela impressora termica (via @page / window.print).
 */
export function LabelPreview({ data, widthMm, heightMm }: LabelPreviewProps) {
  return (
    <div
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: '2mm',
        boxSizing: 'border-box',
      }}
      className="flex flex-col justify-between overflow-hidden border border-neutral-400 bg-white text-black"
    >
      <p
        style={{ fontSize: '2mm' }}
        className="truncate text-center uppercase tracking-wide"
      >
        {data.companyName || ' '}
      </p>

      <div className="text-center">
        <p
          style={{ fontSize: '3.4mm', lineHeight: 1.1 }}
          className="font-bold uppercase"
        >
          {data.productName || '—'}
        </p>
        <p style={{ fontSize: '2mm' }} className="uppercase">
          {data.storageConditionLabel}
        </p>
      </div>

      <div style={{ fontSize: '2.4mm', lineHeight: 1.25 }}>
        <div className="flex justify-between gap-1">
          <span>Manip.:</span>
          <span>{data.manipulationText}</span>
        </div>
        <div className="flex justify-between gap-1 font-bold">
          <span>VALIDADE:</span>
          <span>{data.expiryText}</span>
        </div>
        <div className="flex justify-between gap-1">
          <span>Resp.:</span>
          <span className="truncate">{data.responsibleName || '—'}</span>
        </div>
      </div>
    </div>
  );
}
