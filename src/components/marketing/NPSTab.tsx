import { useState } from 'react';
import { Award, Star, Smile, Frown } from 'lucide-react';

export function NPSTab() {
  const [scores] = useState([
    { id: '1', guest: 'Ana Beatriz', score: 9, comment: 'Excelente atendimento, muito rápido!', channel: 'WhatsApp', date: '2026-05-10' },
    { id: '2', guest: 'Carlos Lima', score: 7, comment: 'Bom, mas poderia melhorar o check-in.', channel: 'WhatsApp', date: '2026-05-09' },
    { id: '3', guest: 'Marina Souza', score: 10, comment: 'Perfeito em todos os aspectos!', channel: 'WhatsApp', date: '2026-05-09' },
    { id: '4', guest: 'Roberto F.', score: 6, comment: 'Wi-fi um pouco lento.', channel: 'Instagram', date: '2026-05-08' },
    { id: '5', guest: 'Juliana Alves', score: 8, comment: 'Gostei muito do café da manhã.', channel: 'WhatsApp', date: '2026-05-07' },
  ]);

  const promoters = scores.filter(s => s.score >= 9).length;
  const passives = scores.filter(s => s.score >= 7 && s.score <= 8).length;
  const detractors = scores.filter(s => s.score <= 6).length;
  const nps = Math.round(((promoters - detractors) / scores.length) * 100);
  const avg = (scores.reduce((a, b) => a + b.score, 0) / scores.length).toFixed(1);

  function scoreColor(s: number) {
    if (s >= 9) return 'text-emerald-600 bg-emerald-50';
    if (s >= 7) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">NPS Engine</p>
        <h2 className="text-xl font-black text-neutral-950">Satisfação dos Hóspedes</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'NPS Score', value: `${nps}`, icon: Award, color: nps >= 50 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600', bg: 'bg-emerald-50' },
          { label: 'Nota Média', value: avg, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
          { label: 'Promotores', value: promoters.toString(), icon: Smile, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Detratores', value: detractors.toString(), icon: Frown, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* NPS bar */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-sm text-neutral-900 mb-4">Distribuição de Notas</h3>
        <div className="flex rounded-xl overflow-hidden h-6">
          <div className="bg-red-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(detractors / scores.length) * 100}%` }}>{Math.round((detractors / scores.length) * 100)}%</div>
          <div className="bg-amber-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(passives / scores.length) * 100}%` }}>{Math.round((passives / scores.length) * 100)}%</div>
          <div className="bg-emerald-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(promoters / scores.length) * 100}%` }}>{Math.round((promoters / scores.length) * 100)}%</div>
        </div>
        <div className="flex justify-between mt-2 text-[9px] font-bold text-neutral-500">
          <span className="text-red-500">Detratores (0-6)</span>
          <span className="text-amber-500">Neutros (7-8)</span>
          <span className="text-emerald-500">Promotores (9-10)</span>
        </div>
      </div>

      {/* Responses */}
      <div className="space-y-3">
        {scores.map(s => (
          <div key={s.id} className="flex items-start gap-4 p-4 rounded-2xl border border-neutral-100 bg-white shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${scoreColor(s.score)}`}>
              {s.score}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-neutral-900">{s.guest}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{s.comment}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-neutral-400">{s.date}</p>
              <p className="text-[9px] font-bold text-neutral-500">{s.channel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
