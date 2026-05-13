import {
  MessageSquare, Instagram, Facebook, Twitter, Linkedin, Video, Globe,
} from 'lucide-react';

const CHANNELS = [
  { id: 'whatsapp', color: '#10b981', name: 'WhatsApp' },
  { id: 'instagram', color: '#e11d48', name: 'Instagram' },
  { id: 'facebook', color: '#3b82f6', name: 'Facebook' },
  { id: 'twitter', color: '#0a0a0a', name: 'X / Twitter' },
  { id: 'linkedin', color: '#0ea5e9', name: 'LinkedIn' },
  { id: 'tiktok', color: '#0a0a0a', name: 'TikTok' },
  { id: 'google', color: '#0ea5e9', name: 'Google Reviews' },
];

export function CRMTab() {
  const leads = [
    { name: 'Ana Beatriz Costa', score: 92, stage: 'hot', channel: 'whatsapp', lastContact: '2026-05-10', totalConversations: 8, tags: ['VIP', 'Recorrente'] },
    { name: 'Carlos Eduardo Lima', score: 65, stage: 'warm', channel: 'instagram', lastContact: '2026-05-09', totalConversations: 3, tags: ['Novo'] },
    { name: 'Marina Souza', score: 41, stage: 'cold', channel: 'whatsapp', lastContact: '2026-05-07', totalConversations: 1, tags: ['Follow-up'] },
    { name: 'Roberto Ferreira', score: 88, stage: 'hot', channel: 'facebook', lastContact: '2026-05-10', totalConversations: 12, tags: ['VIP', 'Fidelizado'] },
    { name: 'Juliana Alves', score: 74, stage: 'warm', channel: 'google', lastContact: '2026-05-08', totalConversations: 5, tags: ['Empresa'] },
  ];

  function stageLabel(stage: string) {
    return { hot: { label: 'Quente', cls: 'bg-red-100 text-red-700' }, warm: { label: 'Morno', cls: 'bg-amber-100 text-amber-700' }, cold: { label: 'Frio', cls: 'bg-blue-100 text-blue-700' } }[stage] ?? { label: stage, cls: 'bg-neutral-100 text-neutral-600' };
  }

  function scoreColor(score: number) {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">CRM</p>
        <h2 className="text-xl font-black text-neutral-950">Leads e Scoring</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: leads.length.toString(), color: 'text-neutral-900' },
          { label: 'Quentes', value: leads.filter(l => l.stage === 'hot').length.toString(), color: 'text-red-600' },
          { label: 'Mornos', value: leads.filter(l => l.stage === 'warm').length.toString(), color: 'text-amber-600' },
          { label: 'Score Médio', value: Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length).toString(), color: 'text-emerald-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-neutral-100">
                {['Lead', 'Score IA', 'Estágio', 'Canal', 'Último Contato', 'Tags'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-neutral-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => {
                const { label, cls } = stageLabel(lead.stage);
                const ch = CHANNELS.find(c => c.id === lead.channel);
                return (
                  <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600">{lead.name[0]}</div>
                        <div>
                          <p className="font-bold text-sm text-neutral-900">{lead.name}</p>
                          <p className="text-[10px] text-neutral-400">{lead.totalConversations} conversas</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-neutral-100 rounded-full h-1.5">
                          <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className={`text-sm font-black ${scoreColor(lead.score)}`}>{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                    <td className="px-5 py-3 text-xs" style={{ color: ch?.color }}>{ch?.name}</td>
                    <td className="px-5 py-3 text-xs text-neutral-500">{lead.lastContact}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.tags.map(t => <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{t}</span>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
