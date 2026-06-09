-- Regua de cobranca / inadimplencia - persistencia profissional.
-- Mantem a carteira atual em public.files e adiciona somente o que precisa de
-- configuracao, rastreabilidade e importacao estruturada.

alter table public.files
  add column if not exists collection_status text default 'open'
    check (collection_status in (
      'open',
      'awaiting_return',
      'awaiting_receipt',
      'payment_promised',
      'disputed',
      'negotiating',
      'legal',
      'paid',
      'cancelled'
    )),
  add column if not exists promise_payment_date date,
  add column if not exists collection_owner text,
  add column if not exists last_collection_event_at timestamptz,
  add column if not exists next_collection_action_at date,
  add column if not exists collection_stage text,
  add column if not exists collection_notes text,
  add column if not exists purchase_order text,
  add column if not exists billing_email_snapshot text;

create table if not exists public.imported_receivable_files (
  id uuid default gen_random_uuid() primary key,
  filename text not null,
  storage_path text not null,
  file_type text not null default 'pdf',
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'extracted', 'awaiting_validation', 'imported', 'failed', 'canceled')),
  raw_text text,
  markdown_content text,
  parsed_json jsonb,
  validation_json jsonb,
  imported_by uuid references auth.users(id),
  imported_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

alter table public.files
  add column if not exists source_import_id uuid references public.imported_receivable_files(id) on delete set null;

create table if not exists public.collection_rules (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  trigger_type text not null default 'days_from_due'
    check (trigger_type in ('days_before_due', 'days_after_due', 'days_from_due', 'manual')),
  days_before_due integer,
  days_after_due integer,
  action_type text not null default 'email'
    check (action_type in ('email', 'task', 'status_change', 'internal_alert')),
  stage text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  unique (stage, trigger_type, coalesce(days_before_due, -9999), coalesce(days_after_due, -9999))
);

create table if not exists public.email_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  subject text not null,
  body text not null,
  tone text not null default 'professional',
  stage text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  unique (stage, name)
);

create table if not exists public.collection_events (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete set null,
  invoice_id uuid references public.files(id) on delete set null,
  rule_id uuid references public.collection_rules(id) on delete set null,
  event_type text not null default 'manual',
  channel text not null default 'email'
    check (channel in ('email', 'whatsapp', 'phone', 'internal', 'manual')),
  status text not null default 'draft'
    check (status in ('draft', 'prepared', 'sent', 'failed', 'responded', 'paused', 'canceled')),
  subject text,
  message text,
  recipients jsonb not null default '[]'::jsonb,
  attachment_path text,
  sent_at timestamptz,
  promise_payment_date date,
  notes text,
  user_id uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists idx_imported_receivable_files_status on public.imported_receivable_files(extraction_status, created_at desc);
create index if not exists idx_collection_rules_active_stage on public.collection_rules(active, stage);
create index if not exists idx_email_templates_active_stage on public.email_templates(active, stage);
create index if not exists idx_collection_events_invoice on public.collection_events(invoice_id, created_at desc);
create index if not exists idx_collection_events_company on public.collection_events(company_id, created_at desc);
create index if not exists idx_files_collection_status on public.files(collection_status, next_collection_action_at);
create index if not exists idx_files_source_import on public.files(source_import_id);

drop trigger if exists set_imported_receivable_files_updated_at on public.imported_receivable_files;
create trigger set_imported_receivable_files_updated_at
before update on public.imported_receivable_files
for each row execute function public.handle_updated_at();

drop trigger if exists set_collection_rules_updated_at on public.collection_rules;
create trigger set_collection_rules_updated_at
before update on public.collection_rules
for each row execute function public.handle_updated_at();

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
before update on public.email_templates
for each row execute function public.handle_updated_at();

alter table public.imported_receivable_files enable row level security;
alter table public.collection_rules enable row level security;
alter table public.email_templates enable row level security;
alter table public.collection_events enable row level security;

drop policy if exists "imported_receivable_files_select_finance" on public.imported_receivable_files;
create policy "imported_receivable_files_select_finance" on public.imported_receivable_files
  for select to authenticated using (public.current_user_can_manage_finance());

drop policy if exists "imported_receivable_files_manage_finance" on public.imported_receivable_files;
create policy "imported_receivable_files_manage_finance" on public.imported_receivable_files
  for all to authenticated using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

drop policy if exists "collection_rules_select_finance" on public.collection_rules;
create policy "collection_rules_select_finance" on public.collection_rules
  for select to authenticated using (public.current_user_can_manage_finance());

drop policy if exists "collection_rules_manage_finance" on public.collection_rules;
create policy "collection_rules_manage_finance" on public.collection_rules
  for all to authenticated using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

drop policy if exists "email_templates_select_finance" on public.email_templates;
create policy "email_templates_select_finance" on public.email_templates
  for select to authenticated using (public.current_user_can_manage_finance());

drop policy if exists "email_templates_manage_finance" on public.email_templates;
create policy "email_templates_manage_finance" on public.email_templates
  for all to authenticated using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

drop policy if exists "collection_events_select_finance" on public.collection_events;
create policy "collection_events_select_finance" on public.collection_events
  for select to authenticated using (public.current_user_can_manage_finance());

drop policy if exists "collection_events_manage_finance" on public.collection_events;
create policy "collection_events_manage_finance" on public.collection_events
  for all to authenticated using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

grant select, insert, update, delete on public.imported_receivable_files to authenticated;
grant select, insert, update, delete on public.collection_rules to authenticated;
grant select, insert, update, delete on public.email_templates to authenticated;
grant select, insert, update, delete on public.collection_events to authenticated;

insert into public.collection_rules (name, description, trigger_type, days_before_due, days_after_due, action_type, stage)
select * from (values
  ('Lembrete preventivo', 'Lembrete antes do vencimento para conferir documento e previsao.', 'days_before_due', 3, null, 'email', 'preventive'),
  ('Aviso de vencimento', 'Aviso objetivo no dia do vencimento.', 'days_from_due', null, 0, 'email', 'due_today'),
  ('Cobranca amigavel', 'Primeiro contato apos atraso.', 'days_after_due', null, 3, 'email', 'soft'),
  ('Cobranca moderada', 'Follow-up formal com prazo de retorno.', 'days_after_due', null, 7, 'email', 'active'),
  ('Cobranca formal', 'Escalada formal para financeiro/gestor.', 'days_after_due', null, 15, 'email', 'formal'),
  ('Cobranca critica', 'Escalada critica antes de bloqueio comercial ou juridico.', 'days_after_due', null, 30, 'email', 'critical')
) as seed(name, description, trigger_type, days_before_due, days_after_due, action_type, stage)
where not exists (select 1 from public.collection_rules r where r.stage = seed.stage);

insert into public.email_templates (name, subject, body, tone, stage)
select * from (values
  ('Lembrete preventivo', '[Royal Macae] Lembrete de vencimento - {{cliente_nome}}', 'Prezados,\n\nIdentificamos titulos com vencimento proximo vinculados a {{cliente_nome}}.\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nSolicitamos conferencia e previsao de pagamento. Caso ja esteja programado, por gentileza nos encaminhar o comprovante quando disponivel.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace', 'preventive', 'preventive'),
  ('Cobranca oficial', '[Royal Macae] Titulos em aberto - {{cliente_nome}}', 'Prezados,\n\nConstam titulos em aberto vinculados a {{cliente_nome}}:\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nSolicitamos regularizacao em ate 48 horas ou retorno com previsao formal de pagamento.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace', 'professional', 'active'),
  ('Escalada critica', '[Royal Macae] Escalada critica de cobranca - {{cliente_nome}}', 'Prezados,\n\nEsta notificacao representa escalada critica da regua de cobranca para {{cliente_nome}}.\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nA ausencia de retorno podera bloquear novas condicoes comerciais e seguir para tratativa gerencial.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace', 'formal', 'critical')
) as seed(name, subject, body, tone, stage)
where not exists (select 1 from public.email_templates t where t.stage = seed.stage and t.name = seed.name);
