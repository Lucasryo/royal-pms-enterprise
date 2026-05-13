import type { ReactElement } from 'react';

// ─── Marketing Module Types ───────────────────────────────────────────────────

export interface Lead {
  id: string;
  guestName: string;
  guestPhone?: string;
  channel: string;
  lastMessage: string;
  lastMessageAt: string;
  status: 'new' | 'ai_responded' | 'needs_human' | 'resolved';
  sentiment: 'happy' | 'neutral' | 'mixed';
  unreadCount?: number;
  assignedTo?: string;
  tags?: string[];
  internalNotes?: string;
}

export interface Message {
  text: string;
  type: 'in' | 'out';
  time: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'scheduled' | 'completed' | 'draft';
  reach: string;
  conv: string;
  channel: string;
  scheduledAt?: string;
  targetAudience?: string;
  messageTemplate?: string;
  created_at?: string;
}

export interface Template {
  id: string;
  name: string;
  text: string;
  category: string;
  channel: string;
  created_at?: string;
}

export interface BotConfig {
  name: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  policies: string;
  rooms: string;
  faq: string;
  pricingTable: string;
  botMood: string;
  upsellActive: boolean;
  npsActive: boolean;
  widgetBotName: string;
  widgetWelcomeMessage: string;
  googleReviewLink: string;
  npsSendAfterHours: number;
}

export interface ReservationPix {
  id: string;
  guest_name: string;
  total_amount: number;
  contact_email: string | null;
  reservation_code: string | null;
  room_number: string | null;
  check_in: string;
  check_out: string;
  pix_payment_id: string | null;
  pix_status: string | null;
  pix_qr_base64: string | null;
  pix_copia_cola: string | null;
  pix_generated_at: string | null;
  fiscal_data: string | null;
}

/** Typed response from the PIX edge function (generate_pix / generate_for_reservation). */
export interface PixPaymentResult {
  ok: boolean;
  error?: string;
  qr_code?: string;
  qr_code_base64?: string;
  payment_id?: string;
}

export interface SocialIntegration {
  id: string;
  name: string;
  description: string;
  icon: ReactElement;
  color: string;
  colorHex: string;
  docsUrl: string;
  field: string;
}

export interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromName: string;
}

export interface PmsWebhook {
  webhookUrl: string;
  apiKey: string;
  enabled: boolean;
}
