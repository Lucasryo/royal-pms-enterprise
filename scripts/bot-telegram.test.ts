import assert from 'node:assert/strict';

type LogStatus = 'sent' | 'edited' | 'deleted' | 'failed' | 'skipped';

function normalizedTelegramEvent(eventType: string, status: LogStatus, payload: Record<string, unknown> = {}) {
  if (eventType === 'ticket_card_send' && status === 'sent' && payload.notify === true) return 'new_ticket_push';
  if (eventType === 'ticket_card_send' && status === 'skipped') return 'card_skip_existing';
  if (eventType === 'ticket_card_edit') return 'card_edit';
  if (eventType === 'ticket_card_delete' && status === 'failed') return 'card_delete_failed';
  if (eventType === 'ticket_card_delete') return 'card_delete';
  return eventType;
}

function shouldSendNewCard(ticket: { telegram_message_id?: number | null }) {
  return !Number(ticket.telegram_message_id);
}

type HousekeepingTicket = {
  housekeeping_reported_by: string | null;
  status: string;
  inspection_status: string | null;
  rating: number | null;
};

function housekeepingStats(staffId: string, tickets: HousekeepingTicket[]) {
  const items = tickets.filter(ticket => ticket.housekeeping_reported_by === staffId);
  const approved = items.filter(ticket =>
    ticket.status === 'resolved' &&
    ticket.inspection_status === 'approved' &&
    ticket.rating !== null
  );
  return {
    pending: items.filter(ticket =>
      ticket.status === 'open' ||
      ticket.status === 'in_progress' ||
      (ticket.status === 'resolved' && ticket.inspection_status === 'pending')
    ).length,
    returnPending: items.filter(ticket => ticket.inspection_status === 'rejected').length,
    approved: approved.length,
  };
}

assert.equal(normalizedTelegramEvent('ticket_card_send', 'sent', { notify: true }), 'new_ticket_push');
assert.equal(normalizedTelegramEvent('ticket_card_send', 'skipped', { reason: 'card_already_exists' }), 'card_skip_existing');
assert.equal(normalizedTelegramEvent('ticket_card_edit', 'edited'), 'card_edit');
assert.equal(normalizedTelegramEvent('ticket_card_delete', 'failed'), 'card_delete_failed');
assert.equal(shouldSendNewCard({ telegram_message_id: null }), true);
assert.equal(shouldSendNewCard({ telegram_message_id: 123 }), false);

const stats = housekeepingStats('staff-1', [
  { housekeeping_reported_by: 'staff-1', status: 'open', inspection_status: null, rating: null },
  { housekeeping_reported_by: 'staff-1', status: 'resolved', inspection_status: 'rejected', rating: null },
  { housekeeping_reported_by: 'staff-1', status: 'resolved', inspection_status: 'approved', rating: 2 },
  { housekeeping_reported_by: 'staff-2', status: 'resolved', inspection_status: 'approved', rating: 5 },
]);

assert.deepEqual(stats, { pending: 1, returnPending: 1, approved: 1 });

console.log('bot telegram focused tests passed');
