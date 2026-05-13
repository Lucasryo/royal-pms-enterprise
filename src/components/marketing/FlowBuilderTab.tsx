import { useState } from 'react';
import { Plus, Edit3, Bell, Bot, Users, CheckCircle2 } from 'lucide-react';

export function FlowBuilderTab() {
  const [flows] = useState([
    { id: '1', name: 'Saudação Inicial', trigger: 'Primeira mensagem', steps: 4, status: 'active', channel: 'WhatsApp' },
    { id: '2', name: 'Qualificação de Lead', trigger: 'Pergunta de preço', steps: 6, status: 'active', channel: 'WhatsApp' },
    { id: '3', name: 'Recuperação de Abandono', trigger: '24h sem resposta', steps: 3, status: 'inactive', channel: 'WhatsApp' },
    { id: '4', name: 'Pós Check-out NPS', trigger: 'Status: checked_out', steps: 5, status: 'active', channel: 'WhatsApp' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Automações</p>
          <h2 className="text-xl font-black text-neutral-950">Flow Builder</h2>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors">
          <Plus className="w-4 h-4" /> Novo flow
        </button>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {flows.map((flow, idx) => (
          <div key={flow.id} className={`flex items-center gap-4 p-4 sm:p-5 ${idx < flows.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <div className={`w-2 h-10 rounded-full shrink-0 ${flow.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-200'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-neutral-900">{flow.name}</p>
              <p className="text-xs text-neutral-500">Trigger: {flow.trigger}</p>
            </div>
            <div className="hidden sm:flex items-center gap-6">
              <div className="text-center">
                <p className="font-black text-sm text-neutral-900">{flow.steps}</p>
                <p className="text-[10px] text-neutral-400">Passos</p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${flow.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                {flow.status === 'active' ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <button className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 transition-colors">
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Flow diagram preview */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-sm text-neutral-900 mb-4">Pré-visualização: Saudação Inicial</h3>
        <div className="flex flex-col items-center gap-3">
          {[
            { icon: Bell, label: 'Trigger', desc: 'Primeira mensagem recebida', color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { icon: Bot, label: 'Mensagem', desc: 'Boas-vindas + menu de opções', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { icon: Users, label: 'Condição', desc: 'Perguntou sobre preço?', color: 'bg-purple-50 border-purple-200 text-purple-700' },
            { icon: CheckCircle2, label: 'Ação', desc: 'Enviar tabela de tarifas', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center w-full max-w-xs">
              <div className={`w-full px-4 py-3 rounded-2xl border ${step.color} flex items-center gap-3`}>
                <step.icon className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase">{step.label}</p>
                  <p className="text-xs">{step.desc}</p>
                </div>
              </div>
              {i < 3 && <div className="w-0.5 h-4 bg-neutral-200" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
