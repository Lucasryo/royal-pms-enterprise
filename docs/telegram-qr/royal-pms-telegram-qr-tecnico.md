# Royal PMS - Telegram, Chamados QR e Vinculo PMS

Documento tecnico de continuidade operacional

Versao: 1.0
Data: 20/05/2026
Escopo: bot Telegram, chamados via QR Code, cadastro de camareiras e vinculo PMS/Telegram.

Este documento explica como o fluxo funciona por dentro para que uma nova pessoa consiga manter, auditar ou corrigir o processo sem depender de conhecimento informal. Ele nao contem tokens, chaves, chat IDs reais ou dados sensiveis de producao.

## Indice

1. Visao geral
2. Componentes principais
3. Cadastro de camareiras e PIN
4. QR Code e abertura do chamado
5. Bot Telegram
6. Estados e botoes do chamado
7. Vinculo PMS/Telegram
8. Logs, manutencao e recuperacao
9. Troubleshooting
10. Deveres de continuidade

## 1. Visao geral

O fluxo conecta quatro partes:

1. Royal PMS: administra usuarios, camareiras, permissoes e chamados.
2. QR Code do quarto/unidade: abre uma tela publica para registrar problema de manutencao.
3. Supabase: valida QR/PIN, grava chamados e executa Edge Functions.
4. Telegram: recebe cards interativos para a equipe assumir, atualizar, vistoriar e avaliar chamados.

Fluxo principal:

```text
Camareira -> QR do quarto -> PIN -> Formulario publico
          -> maintenance_tickets -> notify-maintenance-ticket
          -> Card no Telegram -> Tecnico -> Vistoria -> Avaliacao
```

## 2. Componentes principais

| Area | Componente | Responsabilidade |
| --- | --- | --- |
| Cadastro de camareiras | Admin Housekeeping | Cadastrar nome, andar, telefone, observacoes e PIN de 4 digitos. |
| QR publico | PublicMaintenanceReport | Validar token do QR, validar PIN e abrir chamado. |
| Banco de dados | Supabase Postgres | Persistir chamados, camareiras, vinculos Telegram, logs e estados. |
| Edge Functions | qr-validate, pin-validate, notify-maintenance-ticket | Validar acesso e orquestrar notificacoes/acoes Telegram. |
| Telegram | Bot API | Enviar cards, receber comandos e callbacks. |
| Admin PMS | TelegramPermissionsManager | Criar codigo de vinculo, definir papel Telegram e revogar vinculos. |

## 3. Cadastro de camareiras e PIN

O cadastro fica na area de governanca/camareiras do PMS. Cada camareira deve ter:

- Nome.
- Andar.
- Telefone, quando disponivel.
- Observacoes, quando necessario.
- PIN de 4 digitos.
- Status ativo ou inativo.

O PIN nao deve ser salvo como texto puro. O fluxo atual calcula hash SHA-256 no cadastro e grava em `housekeeping_staff.pin_hash`. A validacao do QR usa a Edge Function `pin-validate`.

Tabela principal:

| Tabela | Campos relevantes |
| --- | --- |
| housekeeping_staff | id, name, floor_number, phone, notes, is_active, pin_hash, last_used_at |

Regra operacional: se a camareira sair da empresa, o cadastro deve ser inativado ou removido. Se apenas esquecer o PIN, criar um novo PIN pelo cadastro.

## 4. QR Code e abertura do chamado

A tela publica de chamado e aberta pelo QR Code do quarto/unidade. O fluxo esperado e:

1. A URL contem um token de QR.
2. O PMS chama `qr-validate` para verificar se o QR e valido e recuperar o quarto/unidade.
3. A camareira informa o PIN.
4. O PMS chama `pin-validate` para identificar a camareira ativa.
5. A camareira preenche prioridade, titulo, descricao e, quando aplicavel, foto ou audio.
6. O PMS cria registro em `maintenance_tickets`.
7. O PMS chama `notify-maintenance-ticket` com `type: public_report` e `ticket_id`.
8. O bot publica o card no Telegram.

Campos importantes no chamado:

| Campo | Uso |
| --- | --- |
| room_number | Quarto/unidade do QR validado. |
| title | Resumo curto do problema. |
| description | Detalhe do problema, incluindo origem quando aplicavel. |
| priority | low, medium, high ou urgent. |
| status | Estado atual do chamado. |
| housekeeping_reported_by | Camareira que abriu pelo PIN. |
| resolution_notes | Pode conter referencia de foto ou notas de resolucao. |

## 5. Bot Telegram

A Edge Function central e `notify-maintenance-ticket`. Ela conversa com a Telegram Bot API, cria cards, atualiza mensagens e processa comandos/callbacks.

Variaveis de ambiente esperadas:

| Variavel | Finalidade |
| --- | --- |
| TELEGRAM_BOT_TOKEN | Token do bot Telegram. Nunca registrar em documento ou log publico. |
| TELEGRAM_CHAT_ID | Chat/grupo onde os chamados sao publicados. Usar apenas placeholder em documentacao. |
| SUPABASE_URL | URL do projeto Supabase. |
| SUPABASE_SERVICE_ROLE_KEY | Chave de servico para a funcao. Nunca expor. |
| TELEGRAM_WEBHOOK_SECRET | Segredo para proteger webhook. |
| BOT_MAINTENANCE_SECRET | Segredo para rotinas internas de manutencao/teste do bot. |

O bot guarda referencias de mensagens do Telegram no chamado para poder editar o card depois:

| Campo | Uso |
| --- | --- |
| telegram_chat_id | Chat onde o card foi publicado. |
| telegram_message_id | Mensagem do card. |
| telegram_card_updated_at | Ultima atualizacao conhecida do card. |

## 6. Estados e botoes do chamado

O card exibido no Telegram muda conforme o estado do chamado.

| Momento | Botoes principais | Resultado esperado |
| --- | --- | --- |
| Chamado aberto | Assumir | Tecnico assume o chamado. |
| Em andamento | Concluir, Falta de Pecas, Adicionar nota, Transferir, Ver detalhes | Tecnico atualiza a execucao. |
| Aguardando pecas | Pecas Recebidas, Concluir | Retoma ou encerra o trabalho. |
| Aguardando vistoria | Assumir Vistoria | Inspetor/supervisor assume conferencia. |
| Em vistoria | Aprovar, Reprovar | Aprova encerramento ou devolve para manutencao. |
| Aprovado sem nota | 1 a 5 estrelas | Registra avaliacao final. |

Callback data usados pelo bot:

| Callback | Finalidade |
| --- | --- |
| assume:id | Assumir chamado. |
| resolve:id | Concluir chamado. |
| parts:id | Marcar falta de pecas. |
| parts_ok:id | Marcar pecas recebidas. |
| insp_assume:id | Assumir vistoria. |
| insp_ok:id:telegram_id | Aprovar vistoria. |
| insp_nok:id:telegram_id | Reprovar vistoria. |
| rate:id:nota | Avaliar de 1 a 5. |

O comando `/meus` mostra chamados em andamento vinculados ao usuario Telegram.

## 7. Vinculo PMS/Telegram

O vinculo liga um usuario do PMS a uma conta do Telegram. O administrador faz isso pela tela de permissoes Telegram:

1. Seleciona o usuario PMS.
2. Escolhe o papel Telegram.
3. Gera um codigo temporario.
4. O colaborador envia `/vincular CODIGO` no Telegram.
5. O bot valida o codigo e cria o vinculo.

Papeis suportados:

| Papel | Uso |
| --- | --- |
| technician | Tecnico de manutencao. Pode assumir e executar chamados. |
| inspector | Vistoria/supervisao. Pode atuar na etapa de inspecao. |
| admin | Administracao. Pode acompanhar e operar fluxo com maior alcance. |

Tipos internos usados pela Edge Function:

| Tipo | Finalidade |
| --- | --- |
| telegram_permissions | Listar perfis e vinculos Telegram. |
| create_telegram_link_code | Criar codigo de vinculo PMS/Telegram. |
| revoke_telegram_binding | Revogar vinculo existente. |

## 8. Logs, manutencao e recuperacao

O bot registra tentativas e falhas em logs de notificacao. Esses logs devem ser consultados quando:

- O card nao aparece no Telegram.
- O card existe, mas nao atualiza.
- Um botao retorna erro.
- Ha suspeita de webhook duplicado ou fora de ordem.

A funcao tambem possui rotinas internas para saude e manutencao do bot, como health check, reconciliacao ou recriacao de cards. Essas chamadas devem ser protegidas por segredo operacional e usadas apenas por alguem tecnico.

## 9. Troubleshooting

| Sintoma | Causa provavel | Verificacao | Acao |
| --- | --- | --- | --- |
| Bot nao envia mensagem | Token, chat ID ou permissao do bot incorretos | Conferir variaveis e logs da Edge Function | Reconfigurar segredo/permissao e testar health check |
| QR invalido | Token expirado, removido ou quarto nao encontrado | Testar `qr-validate` e conferir cadastro do QR | Regerar QR ou corrigir vinculo do quarto |
| PIN recusado | PIN incorreto, camareira inativa ou hash desatualizado | Conferir `housekeeping_staff` | Atualizar PIN ou ativar cadastro |
| Chamado nao aparece | Insert falhou ou notificacao falhou | Conferir `maintenance_tickets` e logs | Reprocessar notificacao com `ticket_id` |
| Card nao atualiza | Mensagem apagada, chat mudou ou erro Telegram | Conferir `telegram_chat_id` e `telegram_message_id` | Recriar card ou reconciliar cards |
| Colaborador sem permissao | Vinculo ausente ou papel incorreto | Conferir vinculos Telegram no Admin | Gerar novo codigo ou alterar papel |
| Avaliacao nao registra | Card fora do estado correto ou callback rejeitado | Conferir status e logs | Reabrir fluxo de avaliacao ou corrigir estado |

## 10. Deveres de continuidade

- Manter os segredos em cofre/ambiente seguro, nunca em PDF, chat ou planilha aberta.
- Registrar quem tem papel `admin` no Telegram.
- Revogar vinculos de colaboradores desligados.
- Testar QR e PIN sempre que criar novo andar/quarto.
- Conferir logs apos alteracoes em Edge Functions.
- Manter este documento atualizado sempre que alterar botao, estado, tabela ou permissao.
