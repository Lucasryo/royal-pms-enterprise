# Royal PMS Enterprise

PMS web para operacao hoteleira de grande porte, baseado em React/Vite, Supabase e Vercel. Esta pasta e uma entrega nova e isolada da base original, com schema Supabase completo, RLS por perfil/empresa, funcoes Edge para operacoes privilegiadas e preservacao do design system ja existente.

## Modulos Entregues

- Arquitetura por departamentos: Reservas, Recepcao, Manutencao, Restaurante, Eventos, Financeiro/Faturamento e Admin.
- Calendario espelhado em todos os modulos internos, exibindo eventos, chegadas e saidas para manter os setores alinhados.
- Work Queues por modulo: tarefas operacionais com setor origem/destino, prioridade, SLA, status, vinculo operacional, nota e historico.
- Autenticacao, perfis, permissoes e matriz de acesso por cargo.
- Empresas, hospedes, equipe e cadastro administrativo.
- Reservas, solicitacoes de reserva, check-in, check-out e voucher.
- Inventario de UHs, governanca, limpeza, inspecao e bloqueio de manutencao.
- Folio de hospedagem com diarias, consumos, estornos, transferencias e extrato.
- POS/restaurante para vendas diretas, room service e lancamento automatico de consumo no folio.
- Perfil `restaurant` dedicado ao restaurante, sem acesso a check-in/check-out, com lancamentos, consulta e transferencia de folio no POS.
- Perfis `maintenance` e `housekeeping`, com acesso a operacoes conforme rotina de manutencao e governanca.
- Central de chamados substituindo grupo de WhatsApp: abertura de chamado notifica manutencao/admin no app, com prioridade, UH, responsavel e historico.
- Notificacao telefonica de manutencao via Edge Function `maintenance-phone-notify`, usando telefone cadastrado nos perfis `maintenance`, `manager` e `admin`.
- Gestao Pro com auditoria noturna, revenue/tarifario, disponibilidade, fila fiscal NFS-e/RPS, CRM de hospedes, estoque, caixa POS, portal do hospede e relatorios executivos.
- Aba Enterprise na Gestao Pro com reservas de grupo/allotment, mapa visual de UHs, preventiva, mensagens manuais ao hospede, contas a receber, controles de pagamento manuais, compras, lavanderia, minibar, forecast/BI, seguranca operacional e multi-propriedade.
- Motor publico de reservas diretas sem channel manager, entrando como solicitacao web para confirmacao manual.
- Central de operacoes com chamados de manutencao, achados e perdidos e passagem de turno.
- Eventos, O.S., faturamento automatico e rastreio operacional.
- Financeiro, faturas, comprovantes, contestacoes, extratos Itau e contas bancarias.
- Tarifarios por empresa, categoria e tipo de quarto, com importacao XLSX sob demanda.
- BI operacional, notificacoes e auditoria.

## Organizacao Operacional

- `Reservas`: reservas internas, solicitacoes, tarifas, contratos, revenue e rate shopper.
- `Recepcao`: check-in/out, walk-in, folio operacional, governanca, UHs, achados/perdidos e passagem de turno.
- `Manutencao`: chamados, tratamento, justificativa, notificacao, acesso a UHs, bloqueio/liberacao e preventiva.
- `Financeiro/Faturamento`: faturas, documentos, baixa, extratos, rastreio, fiscal, AR, pagamentos manuais e BI.
- `Restaurante`: POS, lancamentos, consulta de folio e transferencia de lancamentos.
- `Eventos`: eventos, O.S., saloes e agenda operacional.
- `Admin`: controla tudo, incluindo usuarios, permissoes, empresas, auditoria, Gestao Pro e camadas enterprise.
- `Work Queue`: cada modulo recebe suas pendencias e pode enviar tarefas para outro setor; o Admin enxerga o centro de controle completo.

## Arquitetura

- Frontend: Vite + React + Tailwind, mantendo o visual Royal PMS.
- Backend: Supabase Auth, Postgres, Storage e Edge Functions.
- Deploy: Vercel para frontend e Supabase para banco/funcoes.
- Legado: `server.ts` e `electron/` ficam apenas como referencia local; o fluxo web de producao nao depende deles.

## Variaveis

Frontend, no Vercel e em `.env.local`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Segredos das Supabase Edge Functions:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
MAINTENANCE_NOTIFY_WEBHOOK_URL=
MAINTENANCE_NOTIFY_WEBHOOK_TOKEN=
NOMINATIM_ENDPOINT=
NOMINATIM_USER_AGENT=
```

`GEMINI_API_KEY` nao deve ser exposta no frontend. A extracao por IA passa pela Edge Function `ai-document-extract`.
`MAINTENANCE_NOTIFY_WEBHOOK_URL` e opcional, mas e o ponto recomendado para conectar WhatsApp/SMS via Meta Cloud API, Twilio, Z-API, Make ou n8n.
`NOMINATIM_ENDPOINT` e opcional; por padrao usa o endpoint publico do OpenStreetMap/Nominatim. Configure `NOMINATIM_USER_AGENT` com nome do hotel/projeto e contato tecnico antes de usar em producao.

## Setup Local

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
npm run preview
```

## Supabase

1. Crie um projeto Supabase.
2. Crie um bucket privado chamado `files`.
3. Aplique [supabase_schema.sql](/C:/Users/Lucass/Downloads/RoyalPMS-Enterprise/supabase_schema.sql:1) no SQL Editor.
4. Configure os secrets das Edge Functions.
5. Publique as funcoes:

```bash
supabase functions deploy admin-create-user
supabase functions deploy ai-document-extract
supabase functions deploy public-booking-request
supabase functions deploy maintenance-phone-notify
supabase functions deploy rate-shopper-locate
```

## Primeiro Admin

Crie o primeiro usuario pelo painel do Supabase Auth. Depois, no SQL Editor, promova o perfil para admin:

```sql
update public.profiles
set role = 'admin'
where email = 'email-do-admin@hotel.com';
```

Se o perfil ainda nao existir, faca login uma vez no app para o bootstrap criar o perfil `client`, e entao rode o update acima.

## Observacoes de Producao

- O schema usa RLS para limitar clientes aos dados da propria empresa e liberar operacao completa apenas para staff autorizado.
- Perfis internos enxergam operacoes conforme responsabilidade: recepcao opera, reservas/financeiro consultam impacto, eventos registra pendencias de montagem e saloes.
- A criacao administrativa de usuarios acontece por Edge Function com service role, nunca direto pelo navegador.
- A IA de leitura de documentos tambem roda por Edge Function para proteger a chave e centralizar auditoria.
- O motor publico nao confirma disponibilidade automaticamente; ate integrar channel manager, toda reserva web entra como `WEB-DIRETO` para aprovacao da central.
- O POS registra pedidos, formas de pagamento e lancamentos de alimentos/bebidas no folio de reservas em hospedagem.
- O Rate Shopper manual permite que `admin`, `manager` e `reservations` localizem concorrentes por cidade/localidade, salvem a base competitiva e atualizem a tarifa observada manualmente.
- Recursos que dependem de APIs externas reais, como gateway de pagamento, emissao fiscal municipal automatica, WhatsApp ativo e channel manager, ficaram preparados como workflow manual/auditavel para futura integracao.
- O build ainda alerta sobre chunks grandes; isso e esperado pela quantidade de modulos, PDF e dashboards. A importacao XLSX ja foi movida para carregamento sob demanda.
- Antes da virada real, cadastre o inventario completo de UHs na tela Governanca ou por importacao SQL.
