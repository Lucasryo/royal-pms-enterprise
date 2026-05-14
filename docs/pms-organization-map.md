# PMS organization map

This note documents the current product organization so the PMS does not keep growing through duplicated top-level screens.

## Primary modules

- Hotel
  - Painel: operational home, metrics, quick actions, and module map.
  - Reservas: reservations, occupancy, public rates, blocked dates, corporate tariffs, and revenue/rate shopper.
  - Recepcao: check-in/out, occupancy, housekeeping/UHs, and shift notes.
  - Manutencao: kept unchanged by request.
  - Restaurante POS: restaurant sales, products, cash, and POS routines.
  - Eventos: event agenda, items, quotes, and execution.

- Receita
  - Financeiro: billing, documents, banks, receivables, and charge tracking.
  - Faturamento Prio: Prio-specific billing generation.
  - Relatorios: executive reporting and exports.

- Gestao
  - Controle geral: users, permissions, companies, registration, audit, and setup.
  - QR Manutencao and Camareiras remain operational utilities, not duplicated core modules.

- Canais
  - Marketing: kept unchanged by request.

## Legacy views

The app still contains older direct views such as `checkin`, `housekeeping`, `operations`, `professional`, `guests`, `companies`, `tracking`, `tariffs`, `registration`, `staff`, and `audit`.

They should stay hidden from the primary navigation and be accessed through their owning module. This keeps old functionality available while making the product feel like one organized PMS instead of many unrelated pages.

## Guardrails

- Do not edit Marketing module internals without explicit approval.
- Do not edit Maintenance module internals without explicit approval.
- Prefer adding features into the owning module shell instead of creating another top-level sidebar item.
- New top-level items should only be created when they represent a full operational area, not a single tab.
