import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface ChatMessage {
  text: string;
  type: 'in' | 'out';
  time: string;
  typing?: boolean;
}

export function SimulatorTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { text: 'Olá! Gostaria de fazer uma reserva para o próximo fim de semana.', type: 'in', time: '10:31' },
    { text: 'Olá! Seja bem-vindo ao Royal PMS Palace Hotel 🏨 Temos disponibilidade! Para 2 pessoas, nossa UH Executiva está R$ 359/noite. Inclui café da manhã, Wi-Fi e estacionamento. Deseja confirmar?', type: 'out', time: '10:31' },
    { text: 'Sim! Vou querer o pacote completo. Tem piscina?', type: 'in', time: '10:32' },
    { text: 'Sim! Temos piscina descoberta disponível das 7h às 22h 🏊 Posso confirmar a reserva agora?', type: 'out', time: '10:32' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { text: userText, type: 'in', time: now };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Add typing indicator
    const typingMsg: ChatMessage = { text: '', type: 'out', time: now, typing: true };
    setMessages(prev => [...prev, typingMsg]);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bot-simulator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Erro ao contatar o assistente.');
      }

      const replyTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [
        ...prev.filter(m => !m.typing),
        { text: data.reply, type: 'out', time: replyTime },
      ]);
    } catch (err) {
      setMessages(prev => prev.filter(m => !m.typing));
      const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Bot indisponível: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Simulador</p>
        <h2 className="text-xl font-black text-neutral-950">Testar WhatsApp Bot</h2>
        <p className="text-sm text-neutral-500">Simule uma conversa real com o assistente virtual do hotel.</p>
      </div>

      {/* Phone frame */}
      <div className="flex justify-center">
        <div className="w-full max-w-sm bg-neutral-100 rounded-[40px] p-3 shadow-2xl">
          {/* Status bar */}
          <div className="bg-[#075E54] rounded-[32px] overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
              <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center font-black text-white text-sm">R</div>
              <div>
                <p className="text-white font-bold text-sm">Royal PMS Hotel</p>
                <p className="text-emerald-300 text-[10px]">{loading ? 'digitando...' : 'online'}</p>
              </div>
            </div>
            {/* Messages area */}
            <div className="h-80 overflow-y-auto p-3 space-y-2" style={{ background: '#0c1a22 url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3C/svg%3E")' }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.type === 'out' ? 'bg-[#005C4B] text-white' : 'bg-[#202C33] text-white'}`}>
                    {msg.typing ? (
                      <span className="flex items-center gap-0.5 h-4">
                        <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : (
                      <>
                        {msg.text}
                        <p className="text-[9px] text-white/50 mt-1 text-right">{msg.time}</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {/* Input */}
            <div className="px-3 pb-3 flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Mensagem"
                disabled={loading}
                className="flex-1 bg-[#2A3942] text-white text-xs px-4 py-2.5 rounded-full border-0 outline-none placeholder-white/40 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="w-9 h-9 bg-[#00A884] rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
