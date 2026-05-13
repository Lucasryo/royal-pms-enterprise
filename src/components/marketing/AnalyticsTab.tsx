import { useState } from 'react';
import {
  MessageSquare, Bot, AlertCircle, Clock, Star, TrendingUp,
} from 'lucide-react';

export function AnalyticsTab() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  const metrics = {
    '7d': { total: 148, botResolved: 112, escalated: 36, avgResp: 2.4, satisfaction: 4.7, conversion: 12.3 },
    '30d': { total: 524, botResolved: 398, escalated: 126, avgResp: 3.1, satisfaction: 4.5, conversion: 10.8 },
    '90d': { total: 1847, botResolved: 1401, escalated: 446, avgResp: 2.9, satisfaction: 4.6, conversion: 11.2 },
  }[period];

  const dailyData = Array.from({ length: period === '7d' ? 7 : period === '30d' ? 30 : 90 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return { date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), conversations: Math.floor(Math.random() * 30 + 10), resolved: Math.floor(Math.random() * 25 + 5) };
  }).reverse();

  const maxVal = Math.max(...dailyData.map(d => d.conversations));

  const intents = [
    { intent: 'Consulta de preço', count: 89 },
    { intent: 'Disponibilidade', count: 67 },
    { intent: 'Check-in/out', count: 43 },
    { intent: 'Serviços', count: 31 },
    { intent: 'Cancelamento', count: 18 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Analytics do Bot</p>
          <h2 className="text-xl font-black text-neutral-950">Desempenho</h2>
        </div>
        <div className="flex bg-neutral-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Conversas', value: metrics.total.toString(), icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Bot resolveu', value: metrics.botResolved.toString(), icon: Bot, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Escalados', value: metrics.escalated.toString(), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Resp. média', value: `${metrics.avgResp}min`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Satisfação', value: metrics.satisfaction.toString(), icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
          { label: 'Conversão', value: `${metrics.conversion}%`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-xl font-black text-neutral-950">{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <div className="lg:col-span-2 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-sm text-neutral-900 mb-4">Conversas por Dia</h3>
          <div className="flex items-end gap-1 h-32">
            {dailyData.slice(-14).map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-amber-400 hover:bg-amber-500 transition-colors cursor-default"
                  style={{ height: `${(d.conversations / maxVal) * 100}%`, minHeight: 4 }}
                  title={`${d.date}: ${d.conversations} conversas`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[9px] text-neutral-400">
            <span>{dailyData.slice(-14)[0]?.date}</span>
            <span>{dailyData.slice(-1)[0]?.date}</span>
          </div>
        </div>

        {/* Top intents */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-sm text-neutral-900 mb-4">Top Intenções</h3>
          <div className="space-y-3">
            {intents.map((intent, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-neutral-700 truncate">{intent.intent}</span>
                  <span className="font-black text-neutral-900 ml-2">{intent.count}</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-1.5">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(intent.count / intents[0].count) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
