import { Reservation, ReservationRequest, VoucherHotelProfile } from '../types';

export const DEFAULT_VOUCHER_HOTEL_PROFILE: VoucherHotelProfile = {
  trade_name: 'Royal Macae Palace Hotel',
  legal_name: 'Royal Macae Palace Hotel',
  cnpj: '07.116.901/0001-92',
  address: 'Avenida Atlantica, 1642 - Praia dos Cavaleiros, Macae - RJ',
  phone: '(22) 2123-9650',
  email: 'reservas@royalmacae.com.br',
  website: 'www.royalmacae.com.br',
  logo_url: '/logo.png',
  notes: 'Voucher corporativo sujeito a disponibilidade, politica comercial vigente e validacao do setor de reservas.',
};

export const OCCUPANCY_LABELS: Record<string, string> = {
  SGL: 'SGL - Single',
  DBL: 'DBL - Double',
  TPL: 'TPL - Triple',
  QDL: 'QDL - Quadruplo',
};

export const deriveOccupancyType = (guestsPerUh?: number): 'SGL' | 'DBL' | 'TPL' | 'QDL' => {
  const guests = Number(guestsPerUh || 1);
  if (guests <= 1) return 'SGL';
  if (guests === 2) return 'DBL';
  if (guests === 3) return 'TPL';
  return 'QDL';
};

export const getReservationPaxNames = (reservation: Reservation | ReservationRequest) => {
  const pax = Array.isArray(reservation.pax_names)
    ? reservation.pax_names.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  if (pax.length > 0) return pax;
  return [reservation.guest_name].filter(Boolean);
};

