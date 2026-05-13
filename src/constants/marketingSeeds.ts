/* dev-only seed data */

import type { Lead, Campaign, Template } from '../types/marketing';

export const SEED_LEADS: Lead[] = [
  { id: '1', guestName: 'Ana Beatriz Costa', channel: 'whatsapp', lastMessage: 'Boa tarde! Gostaria de saber a disponibilidade para o próximo feriado.', lastMessageAt: new Date(Date.now() - 5 * 60000).toISOString(), status: 'new', sentiment: 'happy', unreadCount: 3 },
  { id: '2', guestName: 'Carlos Eduardo Lima', channel: 'instagram', lastMessage: 'Quanto custa a diária? Vi pelo stories.', lastMessageAt: new Date(Date.now() - 22 * 60000).toISOString(), status: 'needs_human', sentiment: 'neutral', unreadCount: 1 },
  { id: '3', guestName: 'Marina Souza', channel: 'whatsapp', lastMessage: 'Infelizmente não consegui fazer meu check-in ainda.', lastMessageAt: new Date(Date.now() - 90 * 60000).toISOString(), status: 'needs_human', sentiment: 'mixed', unreadCount: 0 },
  { id: '4', guestName: 'Roberto Ferreira', channel: 'facebook', lastMessage: 'Muito obrigado pelo atendimento! Nota 10.', lastMessageAt: new Date(Date.now() - 3 * 3600000).toISOString(), status: 'resolved', sentiment: 'happy', unreadCount: 0 },
  { id: '5', guestName: 'Juliana Alves', channel: 'google', lastMessage: 'Queria saber se o café da manhã está incluso nas tarifas exibidas.', lastMessageAt: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'ai_responded', sentiment: 'neutral', unreadCount: 0 },
];

export const SEED_CAMPAIGNS: Campaign[] = [
  { id: '1', name: 'Promoção Feriado Junho', status: 'active', reach: '2.847', conv: '12.3%', channel: 'WhatsApp', scheduledAt: '2026-06-01' },
  { id: '2', name: 'Recuperação Carrinho Abandonado', status: 'active', reach: '891', conv: '8.7%', channel: 'WhatsApp' },
  { id: '3', name: 'Reengajamento Aniversariantes', status: 'scheduled', reach: '0', conv: '0%', channel: 'Instagram', scheduledAt: '2026-05-20' },
  { id: '4', name: 'Black Friday Antecipado', status: 'completed', reach: '5.120', conv: '18.4%', channel: 'WhatsApp' },
];

export const SEED_TEMPLATES: Template[] = [
  { id: '1', name: 'Boas-vindas Geral', category: 'Saudação', channel: 'WhatsApp', text: 'Olá [NOME]! 👋 Bem-vindo ao Royal PMS Palace Hotel. Como posso ajudar com sua reserva hoje?' },
  { id: '2', name: 'Preços Executiva', category: 'Preços', channel: 'WhatsApp', text: 'Nossas tarifas para UH Executiva: Semana R$ 289 | Fim de semana R$ 359 | Pacotes especiais disponíveis. Café da manhã incluso.' },
  { id: '3', name: 'Confirmação de Reserva', category: 'Confirmação', channel: 'WhatsApp', text: 'Reserva confirmada! ✅ Olá [NOME], sua estadia de [CHECKIN] a [CHECKOUT] está garantida. Check-in a partir das 14h. Até lá!' },
  { id: '4', name: 'Follow-up 24h', category: 'Follow-up', channel: 'WhatsApp', text: 'Oi [NOME]! Vi que você mostrou interesse em nossa acomodação. Posso te ajudar a finalizar a reserva? Hoje temos disponibilidade especial 🏨' },
  { id: '5', name: 'Wi-Fi e PIX', category: 'Wi-Fi/PIX', channel: 'WhatsApp', text: '📶 Wi-Fi: Rede Royal_Guest | Senha: BemVindo2026\n💰 PIX: contato@royalpms.com' },
];
