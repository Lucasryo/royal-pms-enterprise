# Reservas Channel, multipropriedade e cobranca Cielo

## Objetivo

Separar a configuracao comercial de reservas do PMS operacional, criar o modulo Reservas Channel e preparar o sistema para operar com varias propriedades com isolamento real de dados, cobranca Cielo por hotel e autenticacao por codigo de email.

## Propriedades iniciais

- Royal Macae Palace
- Royal Atlantica Macae
- Royal Kingdom Macae
- Royal Urban Macae

Cada propriedade deve ter suas proprias reservas, empresas, tarifas, UHs, bloqueios, servicos, regras comerciais, configuracao Cielo, comprovantes e logs financeiros.

## Regra de isolamento

O isolamento por propriedade e regra de seguranca, nao apenas filtro visual.

- Usuario de hotel ve somente dados da propria propriedade.
- Financeiro de hotel cobra somente reservas da propria propriedade.
- Cliente externo ve somente empresas e reservas vinculadas ao seu perfil.
- Admin de rede pode ver varias propriedades somente quando o perfil permitir.
- Edge Functions e RLS devem bloquear acesso cruzado mesmo se a UI for burlada.

## Reservas Channel

O Reservas Channel substitui a posicao atual das tarifas corporativas dentro do modulo de clientes. O PMS operacional continua responsavel por recepcao, governanca, manutencao, financeiro e checkout. O Reservas Channel fica responsavel por entrada e configuracao comercial de reservas.

Funcionalidades por propriedade:

- cadastro de empresas;
- vinculo empresa x propriedade;
- tarifas corporativas;
- tipos de UH;
- disponibilidade;
- bloqueios de datas;
- servicos adicionais;
- regras de faturamento;
- regras de cartao virtual;
- solicitacoes de reserva;
- aprovacao, edicao ou recusa de solicitacoes;
- notificacao por email para novas solicitacoes.

## Fluxo de solicitacao de reserva

1. Cliente acessa o portal com email, senha e codigo.
2. Cliente escolhe ou herda empresa/propriedade permitida.
3. Cliente solicita reserva com hospede, datas, tipo de UH, centro de custo, faturamento e observacoes.
4. Reservas Channel valida tarifas, bloqueios, servicos e disponibilidade da propriedade.
5. Sistema cria uma solicitacao pendente.
6. Sistema envia email para o hotel responsavel.
7. Equipe aprova, ajusta ou recusa.
8. Reserva aprovada pode ser enviada ao PMS operacional em uma etapa futura.

## Autenticacao por codigo de email

Regra definida:

- Login com email + senha + codigo.
- Aplica para clientes externos e funcionarios.
- Codigo exigido a cada 30 minutos de inatividade por maquina/dispositivo.
- Codigo expira em 5 minutos.
- 3 tentativas erradas bloqueiam temporariamente a validacao.
- Dispositivo pode ser lembrado por 30 dias.
- Auditoria obrigatoria para envio, sucesso, falha, expiracao, bloqueio, dispositivo lembrado e logout por inatividade.

O codigo nao deve ser salvo em texto puro. Salvar hash, expiracao, tentativas, status, usuario e identificador do dispositivo.

## Cobranca Cielo por propriedade

Cada propriedade tera sua propria configuracao Cielo:

- gateway;
- ambiente sandbox/producao;
- Merchant ID;
- Merchant Key, Client Secret ou API Key;
- status ativo/inativo;
- regra de captura;
- janela de cobranca;
- responsavel financeiro.

Credenciais sensiveis devem ficar em armazenamento seguro server-side. Nao salvar chaves em texto aberto no `app_settings`.

## Fluxo de cobranca

1. Financeiro clica em Cobrar cartao virtual.
2. Backend identifica a reserva e a propriedade.
3. Backend valida permissao do usuario na propriedade.
4. Backend busca credenciais Cielo da propriedade.
5. Backend chama a Cielo.
6. Backend salva o retorno da transacao:
   - status;
   - NSU;
   - autorizacao;
   - TID ou Payment ID;
   - valor;
   - data e hora;
   - bandeira;
   - final 4;
   - usuario;
   - propriedade.
7. Sistema gera/exibe comprovante.

NSU, autorizacao, referencia e comprovante sao retorno de cobranca. Nao sao campos de configuracao.

## Ordem de execucao

1. Modelar propriedades, usuarios por propriedade e escopo de seguranca.
2. Proteger reservas, solicitacoes, empresas, tarifas e cobrancas por propriedade.
3. Criar Reservas Channel e migrar configuracoes comerciais para ele.
4. Implementar autenticacao por codigo de email.
5. Criar configuracao Cielo segura por propriedade.
6. Implementar cobranca Cielo real via backend.
7. Criar comprovante automatico por transacao.
8. Enviar notificacoes por email de novas solicitacoes.
9. Validar RLS, Edge Functions e UI com usuarios de propriedades diferentes.

## Pacotes de execucao

### Pacote 1 - Fundacao multipropriedade

Criar a base sem quebrar dados existentes.

- Criar ou consolidar `hotel_properties`.
- Criar `profile_property_access` para vincular usuarios a propriedades.
- Criar `company_properties` para vincular empresas a propriedades.
- Adicionar `property_id` em tabelas centrais, mantendo `property_scope` temporariamente:
  - `reservations`;
  - `reservation_requests`;
  - `reservation_payment_tokens`;
  - `rooms`;
  - `files`;
  - `folio_charges`;
  - `company_billing_profiles`;
  - `tariffs`;
  - `booking_blocked_dates`.
- Backfill inicial para a propriedade padrao antes de ativar RLS estrita.
- Criar helpers:
  - `current_user_property_ids()`;
  - `current_user_can_access_property(property_id)`;
  - `current_user_can_manage_property_reservations(property_id)`;
  - `current_user_can_manage_property_finance(property_id)`.

### Pacote 2 - RLS e backend por propriedade

Aplicar isolamento real depois do backfill.

- Atualizar politicas de `reservations` e `reservation_requests`.
- Atualizar politicas de `companies` para empresa x propriedade.
- Atualizar politicas de `company_billing_profiles`.
- Remover a politica ampla de `reservation_payment_tokens_staff_all`.
- Restringir tokens, comprovantes e documentos financeiros por `property_id`.
- Revisar Edge Functions que usam service role para validar `property_id` explicitamente.

### Pacote 3 - Reservas Channel

Criar o modulo sem apagar os componentes existentes na primeira fase.

- Criar `src/components/ReservationsChannelModule.tsx`.
- Tabs iniciais:
  - Solicitacoes;
  - Empresas;
  - Tarifas corporativas;
  - Portal cliente;
  - Bloqueios;
  - Disponibilidade/UHs.
- Reposicionar `CompanyManager`, `TariffManager` e `BlockedDatesManager` neste modulo.
- Manter `ClientDashboard` como portal externo do cliente, nao como superficie staff do channel.
- Adicionar compatibilidade temporaria para rotas antigas.
- Adicionar campos:
  - `companies.reservation_channel_enabled`;
  - `companies.portal_contact_email`;
  - `companies.portal_notes`;
  - `tariffs.active`;
  - `tariffs.valid_from`;
  - `tariffs.valid_to`;
  - `tariffs.property_id`;
  - `reservation_requests.channel_source`;
  - `reservation_requests.assigned_to`;
  - `reservation_requests.notified_at`.

### Pacote 4 - Notificacao de solicitacao

- Criar `notifyReservationRequestCreated`.
- Usar `send-resend-email` ou helper central de email.
- Disparar email quando nova solicitacao for criada por:
  - portal do cliente;
  - booking publico;
  - parser de email;
  - criacao manual, se aplicavel.
- Registrar resultado em `reservation_requests.notified_at` ou tabela de log.

### Pacote 5 - Autenticacao com codigo por email

Importante: nao chamar `signInWithPassword` no browser e depois pedir codigo, porque isso ja cria uma sessao valida. A validacao de senha e codigo deve acontecer no backend antes de liberar a sessao ao navegador.

Tabelas:

- `auth_email_challenges`;
- `auth_remembered_devices`;
- `auth_device_sessions`;
- `auth_security_events`.

Edge Functions:

- `auth-email-code-start`;
- `auth-email-code-verify`;
- `auth-device-heartbeat`;
- `auth-device-revoke`.

Regras:

- codigo expira em 5 minutos;
- 3 tentativas erradas bloqueiam a validacao;
- lembrar dispositivo por 30 dias;
- exigir novo codigo apos 30 minutos de inatividade por dispositivo;
- auditar envio, sucesso, falha, expiracao, bloqueio, dispositivo lembrado e logout por inatividade.

Frontend:

- substituir login direto em `Login.tsx`;
- remover bypass de login direto em `MarketingLanding.tsx`;
- criar helper de dispositivo;
- validar sessao persistida antes de aceitar usuario logado.

### Pacote 6 - Cielo real por propriedade

Tabelas:

- `property_payment_gateway_credentials`;
- `virtual_card_transactions`;
- `virtual_card_receipts`.

Campos de credencial por propriedade:

- `property_id`;
- `provider = cielo`;
- `environment`;
- `merchant_id`;
- `merchant_key_encrypted`;
- `active`;
- `created_by`;
- `updated_by`.

Fluxo:

- `charge-virtual-card` recebe `reservation_id`, `amount` e `idempotency_key`.
- Busca reserva, propriedade e permissao do usuario.
- Busca credencial Cielo ativa da propriedade.
- Chama a Cielo server-side.
- Salva transacao com retorno redigido.
- Atualiza reserva somente se a Cielo aprovar.
- Em recusa, salva codigo/mensagem e nao marca como cobrada.
- Gera comprovante server-side.

Campos que saem da configuracao:

- NSU;
- autorizacao;
- TID ou Payment ID;
- comprovante;
- token/referencia por reserva;
- `credentials_configured` editavel;
- `provider` multiplo, se a primeira entrega for Cielo-only;
- `property_scope`.

## Validacao obrigatoria

- Build frontend.
- Teste RLS com usuario de duas propriedades diferentes.
- Teste cliente externo sem acesso a outra empresa.
- Teste funcionario financeiro tentando cobrar reserva de outro hotel.
- Teste Edge Function com service role validando `property_id`.
- Teste login com codigo valido, expirado, errado 3 vezes e dispositivo lembrado.
- Teste nova solicitacao enviando email ao hotel correto.
- Teste cobranca Cielo em sandbox antes de producao.

## Riscos principais

- Registros antigos sem propriedade precisam receber propriedade padrao antes de RLS estrita.
- `property_scope` atual e apenas transitorio; o modelo final deve usar `property_id`.
- Credenciais Cielo nao podem trafegar pelo navegador depois de salvas.
- Dados de cartao completo e CVV nao devem ser persistidos.
- Filtros de UI nao substituem politicas no banco e validacoes em Edge Functions.

## Atualizacao: portal B2B faturado

O Reservas Channel passa a operar como portal B2B isolado do PMS para o fluxo faturado.

Escopo entregue nesta fase:

- `/reservas-channel` tem landing propria e login direto do portal.
- O cliente externo continua solicitando reservas pelo `ClientDashboard`.
- Toda nova solicitacao do cliente notifica os perfis `admin`, `reservations`, `finance` e `faturamento`.
- A reserva publica tambem notifica `finance` e `faturamento`, alem de reservas.
- O portal interno do Reservas Channel tem a aba `Mesa B2B` para acompanhar solicitacoes, aprovar como faturado e avisar financeiro/faturamento.
- A aba `Faturamento` mostra reservas com `payment_method = BILLED`, documentos vinculados e acao de aviso ao financeiro.
- `Vinculos e Voucher` permanece dentro do Reservas Channel e nao deve ser exposto ao cliente externo.

Regra atual de cobranca:

- Forma padrao: `BILLED`.
- Nao solicitar numero de cartao completo, CVV ou dados sensiveis no PMS.
- Cartao virtual fica apenas como roadmap/preparacao tecnica; a cobranca real por gateway sera tratada em fase futura, server-side, com credenciais por propriedade.

Fluxo operacional atual:

1. Cliente cria solicitacao de reserva no portal externo.
2. `reservation_requests` recebe o pedido com status `REQUESTED`.
3. Reservas, financeiro e faturamento recebem notificacao interna.
4. Reservas aprova na `Mesa B2B`.
5. O sistema cria uma reserva confirmada com pagamento `BILLED`.
6. Financeiro/faturamento acompanha a reserva na fila de faturamento do Reservas Channel.
7. Documentos fiscais podem ser anexados e vinculados pela reserva/codigo.

Pendencias para a fase de banco:

- Criar campos persistentes para `channel_source`, `assigned_to`, `notified_at`, `finance_notified_at`, `billing_status` e `billing_owner_id`.
- Criar helper unico `notifyReservationRequestCreated` para portal do cliente, booking publico e parser de email.
- Trocar avisos manuais por log persistente de sincronizacao por destinatario.
- Testar RLS com perfis `client`, `reservations`, `finance` e `faturamento`.
