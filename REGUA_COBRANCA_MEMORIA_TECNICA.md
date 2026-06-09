# REGUA_COBRANCA_MEMORIA_TECNICA.md

Memoria tecnica do modulo SaaS de Regua de Cobranca / Inadimplencia do Royal PMS.

Ultima atualizacao: 2026-06-08 - rodada 2
Origem do briefing: `C:\Users\ROYA\Downloads\Modulo SaaS de Cobranca e Inadimplencia.md` (arquivo original fora do repo, com encoding parcialmente quebrado).

## Regra de continuidade

Este arquivo deve ser atualizado antes de avancar muitas etapas. Toda entrega relevante deve registrar:

- O que foi feito.
- Onde foi feito.
- Por que foi feito dessa forma.
- Arquivos alterados.
- Regras implementadas.
- Pendencias e cuidados para a proxima etapa.

## Visao geral do modulo

O projeto ja possui uma primeira versao funcional do modulo de recebiveis/inadimplencia, exposta no menu `Regua`.

Implementacao atual:

- Rota/view: `collection-rules`.
- Componente principal: `src/components/finance/FinanceReceivablesDesk.tsx`.
- Fonte de dados principal: tabela `files`, filtrando tipos financeiros (`FATURA`, `Hospedagem`, `Alimentacao`, `Lavanderia`, `Eventos`, `Transporte`, `Fatura Evento`).
- Empresas/clientes corporativos: tabela `companies`.
- Auditoria: tabela `audit_logs` via `src/lib/audit.ts`.
- Contas bancarias/Pix: tabela `bank_accounts` e `src/components/BankAccountsManager.tsx`.
- PDF financeiro ja existente: `src/components/finance/InvoicePrintModal.tsx` e `src/components/VoucherModal.tsx`.

Decisao atual: reaproveitar a base financeira existente (`files`, `companies`, `bank_accounts`, `audit_logs`) como primeira camada do modulo, em vez de criar imediatamente tabelas paralelas `clients` e `invoices`. Isso reduz retrabalho e evita duplicar faturas que o PMS ja controla.

## Arquitetura auditada em 2026-06-08

### Resolvido

- Menu `Regua` existe em `src/App.tsx` e abre `FinanceReceivablesDesk` com `initialTab="billing"`.
- Permissao de acesso existe para `collection-rules` em `src/lib/permissions.ts`, restrita a perfis financeiros/gestao.
- Dashboard executivo existe com total da carteira, vencidos, a vencer, atraso medio, aging financeiro e pipeline da regua.
- Carteira por empresa existe com busca, filtro de risco, totais, faturas e expansao de detalhes.
- Regua operacional existe com etapas preventivas e atrasadas: Preventiva, Cobranca inicial, Ativa, Executiva e Critica.
- Lotes de cobranca existem com selecao de faturas, filtro por vencidas/a vencer, texto consolidado para e-mail ou WhatsApp e copia para a area de transferencia.
- Parser de Markdown existe para importar relatorio convertido do ERP.
- Previa humana existe no fluxo do parser: o usuario roda a leitura, revisa a previa e so depois confirma a importacao.
- Importacao do parser cria empresas faltantes e faturas em `files`, evitando duplicidade simples por empresa + numero no `original_name`.
- Auditoria de importacao existe via `logAudit`.
- PDF de fatura financeira existe em `InvoicePrintModal`, com logo, cliente, resumo, itens, vencimento e exportacao PDF via `html2canvas` + `jsPDF`.
- PDF consolidado com dados bancarios/Pix existe em `VoucherModal`, usando contas cadastradas em `bank_accounts`.
- RLS existe para `files`, `bank_accounts` e storage `files` no `supabase_schema.sql`.
- Nao ha gateway implementado dentro do modulo de regua. O modulo atual prepara cobranca manual por texto/PDF.

### Parcial

- Importacao obrigatoria "PDF -> texto -> Markdown -> JSON" ainda nao esta completa no modulo de regua. Hoje o modulo recebe Markdown colado manualmente; o projeto tem dependencias de PDF (`pdfjs-dist`, `pdf-lib`, `jspdf`) e extratores em outros fluxos, mas nao ha upload/processamento completo de PDF do ERP dentro da regua.
- A modelagem sugerida do briefing (`clients`, `invoices`, `collection_rules`, `collection_events`, `email_templates`, `payment_instructions`, `imported_files`) nao foi criada literalmente. A implementacao atual usa estruturas existentes (`companies`, `files`, `bank_accounts`, `audit_logs`).
- Templates de e-mail existem como gerador de texto por nivel dentro do componente, mas ainda nao existem como tabela editavel `email_templates`.
- Regras da regua existem em constantes/frontend e parte em `localStorage`, mas ainda nao existem como configuracao persistente multiempresa no banco.
- Historico de cobranca existe parcialmente via auditoria e campos de tracking em `files`, mas ainda nao ha uma tabela dedicada de eventos de cobranca por fatura.
- Status financeiros existem parcialmente (`PENDING`, `PAID`, `CANCELLED`, disputa via campos `dispute_*`), mas nao cobrem todos os estados do briefing: aguardando comprovante, promessa de pagamento, em negociacao, juridico e baixada manualmente.
- Dados bancarios existem em `bank_accounts`, mas o `InvoicePrintModal` ainda nao imprime dados bancarios/Pix; isso aparece no `VoucherModal`.
- Relatorios existem parcialmente na propria tela e por impressao do navegador, mas ainda nao ha exportacao estruturada Excel/CSV/PDF gerencial para todos os relatorios listados.
- Permissoes por perfil existem no app, mas o modulo ainda precisa de permissoes granulares para importar, enviar cobranca, editar regra e configurar banco.

### Pendente

- Aplicar no banco remoto a migration `supabase/migrations/20260608000100_receivables_collection_professionalization.sql`.
- Deploy da Edge Function `send-resend-email` atualizada para aceitar anexos PDF.
- Jobs assincronos automaticos ainda nao foram ativados; a tela agora sugere/gera lotes manualmente com auditoria.

### Resolvido no codigo em 2026-06-08 - rodada 2

- Upload real de PDF do ERP dentro da regua.
- Salvamento do arquivo importado em storage privado, com registro em `imported_receivable_files` quando a migration estiver aplicada.
- Extracao de texto do PDF no cliente usando `pdfjs-dist`; a extracao backend/edge pode ser adicionada depois se houver necessidade de processar arquivos grandes em segundo plano.
- Conversao automatica PDF/texto -> Markdown -> JSON estruturado.
- Tela de pre-validacao com edicao linha a linha, acao por linha, duplicidade, erro, criacao, atualizacao e ignorar.
- Confirmacao de importacao com criacao/atualizacao de faturas, sempre apos revisao humana.
- Estrutura persistente para eventos de cobranca via `collection_events`.
- Estrutura persistente para templates de e-mail via `email_templates`.
- Estrutura persistente para regras da regua via `collection_rules`.
- Controle de promessa de pagamento com data e pausa de lote.
- Controle de aguardando comprovante com pausa de escalada critica.
- Controle formal de contestacao, negociacao, juridico, reativacao e status da regua.
- Envio real de e-mail de cobranca com anexo PDF a partir do lote, via `send-resend-email`.
- Geracao de PDF de cobranca consolidado diretamente no fluxo da regua, com dados bancarios e faturas selecionadas.
- Exportacao CSV da carteira e do lote de cobranca.

## Regras de negocio consolidadas

### Resolvidas ou parcialmente resolvidas

- Faturas pagas nao entram nos lotes da regua: implementado no filtro do lote.
- Faturas canceladas nao entram nos lotes da regua: implementado no filtro do lote.
- Dias de atraso sao calculados automaticamente a partir de `due_date`.
- Risco por empresa e calculado com limite critico e maior atraso.
- Importacao via parser evita duplicidade simples por empresa + numero da fatura no `original_name`.
- Toda importacao confirmada pelo parser registra auditoria.
- A importacao atual exige acao humana: rodar parser, revisar previa e confirmar.

### Ainda precisam ser fortalecidas

- Duplicidade deve considerar numero da fatura, cliente e valor, nao apenas `original_name`.
- Se fatura ja existir, deve atualizar valor em aberto/status quando houver mudanca validada.
- Faturas contestadas devem pausar a regua de forma explicita.
- Promessa de pagamento deve pausar ate a data prometida.
- Aguardando comprovante nao deve ir para cobranca critica.
- Cliente sem e-mail financeiro deve ser sinalizado.
- Todo envio de cobranca precisa gerar log com destinatario, template, PDF e usuario.
- Dados financeiros precisam de RLS e validacao tambem no backend, nao apenas no frontend.

## Modelagem atual versus briefing

| Necessidade do briefing | Estrutura atual | Status |
| --- | --- | --- |
| Clientes/devedores | `companies` | Parcial |
| Faturas | `files` com tipo financeiro | Parcial |
| Contas/dados bancarios | `bank_accounts` | Resolvido para cadastro |
| Auditoria | `audit_logs` | Parcial |
| Arquivos importados | `files.storage_path` e storage `files` | Parcial |
| Regras da regua | constantes em `FinanceReceivablesDesk.tsx` + `localStorage` | Parcial |
| Eventos de cobranca | nao dedicado | Pendente |
| Templates de e-mail | texto gerado no componente | Parcial |
| Payment instructions | `bank_accounts`, sem tabela especifica | Parcial |

Decisao tecnica: manter `companies` e `files` como base inicial, mas criar tabelas dedicadas apenas quando a funcionalidade exigir historico, configuracao multiempresa ou rastreabilidade que `files` nao cobre bem.

## Fluxos implementados

### Painel executivo

Arquivo: `src/components/finance/FinanceReceivablesDesk.tsx`

Status: Resolvido para primeira versao.

Inclui KPIs, aging, pipeline da regua, fila prioritaria e alertas operacionais.

### Carteira por empresa

Arquivo: `src/components/finance/FinanceReceivablesDesk.tsx`

Status: Parcial.

Inclui busca por empresa/CNPJ, filtro de risco, total em aberto, vencido, a vencer, faturas e expansao por empresa. Ainda faltam filtros avancados por valor, responsavel, P.O., e-mail financeiro, promessa, comprovante e contestacao.

### Importador ERP via Markdown

Arquivo: `src/components/finance/FinanceReceivablesDesk.tsx`

Status: Parcial.

Fluxo atual:

1. Usuario cola Markdown do relatorio.
2. Sistema interpreta empresas e faturas.
3. Sistema mostra previa.
4. Usuario confirma.
5. Sistema cria empresas/faturas e registra auditoria.

Limite: ainda nao faz upload de PDF nem extracao automatica.

### Lotes de cobranca

Arquivo: `src/components/finance/FinanceReceivablesDesk.tsx`

Status: Parcial.

Permite selecionar faturas, escolher nivel da regua, gerar texto para e-mail/WhatsApp e copiar. Ainda nao envia e-mail real nem anexa PDF automaticamente.

### PDF financeiro

Arquivos:

- `src/components/finance/InvoicePrintModal.tsx`
- `src/components/VoucherModal.tsx`

Status: Parcial.

Ha geracao/exportacao PDF. O documento consolidado com banco/Pix esta no `VoucherModal`; a regua ainda precisa integrar um PDF consolidado por lote.

## Bibliotecas usadas ou disponiveis

- `recharts`: graficos do dashboard/aging.
- `jspdf`: geracao de PDF client-side.
- `html2canvas`: renderizacao de HTML para PDF.
- `pdf-lib`: manipulacao/mescla de PDF em outros fluxos do PMS.
- `pdfjs-dist`: dependencia disponivel para leitura de PDF, ainda nao integrada ao fluxo de regua.

## Cuidados obrigatorios

- Nao implementar gateway de pagamento neste modulo.
- Nao implementar checkout, link de pagamento, cartao de credito, Pix automatico, boleto integrado, conciliacao bancaria automatica ou adquirente para a regua de cobranca.
- O app possui fluxos de cartao virtual/Cielo para reservas B2B em outras areas. Isso nao deve ser misturado com inadimplencia/regua.
- Dados de PDF financeiro devem ficar em storage privado.
- Toda importacao definitiva precisa de revisao humana.
- Nao mexer nos fluxos protegidos de Telegram, QR Code e vinculo Telegram durante este modulo.

## Plano de implementacao recomendado

### Etapa 1 - Consolidar memoria e arquitetura

Status: Resolvido em 2026-06-08.

O que foi feito:

- Auditado o briefing.
- Auditado o codigo existente.
- Criado este arquivo de memoria tecnica.
- Marcados requisitos como resolvidos, parciais e pendentes.

Arquivos alterados:

- `REGUA_COBRANCA_MEMORIA_TECNICA.md`

### Etapa 2 - Persistencia dedicada minima

Status: Resolvido no codigo em 2026-06-08; pendente aplicar migration no banco remoto.

Criar migracao para tabelas que faltam e nao devem viver apenas no frontend:

- `collection_rules`
- `collection_events`
- `email_templates`
- `imported_receivable_files` ou equivalente
- campos complementares em `files` ou tabela dedicada para promessa de pagamento, aguardando comprovante, negociacao e responsavel.

### Etapa 3 - Upload e extracao de PDF

Status: Resolvido no codigo em 2026-06-08.

Implementar fluxo:

1. Upload PDF privado.
2. Registro pending.
3. Cliente extrai texto com `pdfjs-dist` nesta rodada; backend/edge fica como evolucao para processamento pesado.
4. Conversao para Markdown.
5. Parser gera JSON estruturado.
6. UI exibe pre-validacao.

### Etapa 4 - Pre-validacao robusta

Status: Resolvido no codigo em 2026-06-08.

Adicionar tela com edicao linha a linha, duplicidades, erros, campos ausentes, novos clientes e faturas existentes.

### Etapa 5 - Importacao definitiva segura

Status: Resolvido no codigo em 2026-06-08.

Confirmacao deve criar/atualizar clientes e faturas, gerar logs e nunca gravar sem revisao.

### Etapa 6 - Cobranca com PDF e e-mail real

Status: Resolvido no codigo em 2026-06-08; pendente deploy da Edge Function atualizada.

Gerar PDF consolidado por lote com banco/Pix e enviar por e-mail via funcao existente de envio, registrando evento de cobranca.

### Etapa 7 - Relatorios e automacao

Status: Parcial: CSV resolvido; jobs automaticos continuam como evolucao.

Exportar Excel/CSV/PDF, acompanhar efetividade e criar jobs/sugestoes automaticas da regua.

### 2026-06-08 - Profissionalizacao da aba Regua

O que foi feito:

- Criada migration local `supabase/migrations/20260608000100_receivables_collection_professionalization.sql`.
- Adicionadas tabelas `imported_receivable_files`, `collection_rules`, `email_templates` e `collection_events`.
- Adicionados campos de cobranca em `files`: `collection_status`, `promise_payment_date`, `collection_owner`, `last_collection_event_at`, `next_collection_action_at`, `collection_stage`, `collection_notes`, `purchase_order`, `billing_email_snapshot` e `source_import_id`.
- Criado motor `src/components/finance/receivablesEngine.ts` para parser, extracao PDF, validacao, templates, CSV e PDF.
- Reescrita a aba `src/components/finance/FinanceReceivablesDesk.tsx` com painel, carteira, lote, importador, templates, historico e playbook.
- Atualizada `supabase/functions/send-resend-email/index.ts` para aceitar anexos.
- Atualizado `src/types.ts` para os campos novos de cobranca.

Por que foi feito assim:

- A base `files`/`companies` continua sendo a carteira oficial para evitar duplicidade.
- As tabelas novas guardam somente configuracao, historico, templates e importacoes, que precisam de rastreabilidade propria.
- A extracao de PDF ficou client-side com `pdfjs-dist` porque o projeto ja tem a dependencia e isso entrega o fluxo agora; se os PDFs ficarem grandes ou variaveis demais, mover para Edge Function e natural.

Arquivos alterados:

- `supabase/migrations/20260608000100_receivables_collection_professionalization.sql`
- `src/components/finance/receivablesEngine.ts`
- `src/components/finance/FinanceReceivablesDesk.tsx`
- `src/types.ts`
- `supabase/functions/send-resend-email/index.ts`
- `REGUA_COBRANCA_MEMORIA_TECNICA.md`

Validacao:

- `npm run lint` passou.

Pendencias operacionais:

- O conector Supabase nao teve permissao para listar/aplicar migrations no projeto remoto `piwknissqcvkvnzloojh`.
- Aplicar a migration SQL no banco remoto antes de esperar persistencia real de templates/eventos/importacoes.
- Fazer deploy da Edge Function `send-resend-email` para ativar anexos no ambiente remoto.
- A tela tem fallback quando as tabelas novas ainda nao existem, mas essa condicao nao substitui aplicar a migration.

### 2026-06-08 - Correcao do importador para o layout real do contas a receber

Problema encontrado:

- O importador antigo perdia empresas/faturas do relatorio real `relatorio_contas_receber_royal_macae (1).md`.
- A causa principal era descartar faturas com `Vlr Receber: 0,00`; isso removia faturas zeradas e empresas que tinham somente faturas zeradas.
- A extracao de PDF tambem juntava itens de texto em uma linha unica, o que fazia o parser perder quebras entre empresa, fatura, total da empresa e resumo geral.
- Textos com acentos em mojibake como `EmissÃ£o` nao eram normalizados para `emissao`, prejudicando a leitura dos campos.

O que foi feito:

- `src/components/finance/receivablesEngine.ts` agora normaliza o layout especifico:
  - `# RELATORIO DE CONTAS A RECEBER - HOTEL`
  - `Data de Operacao`
  - `## EMPRESA (CNPJ: ...)`
  - `* FT-... | Emissao | Vencimento | Vlr Fatura | Vlr Receber | Status`
  - `## Total Empresa`
  - `# RESUMO GERAL`
- O parser agora aceita faturas com valor zero.
- Empresas com faturas zeradas deixam de sumir.
- A extracao de PDF passou a reconstruir linhas por coordenadas X/Y do `pdfjs-dist`, preservando melhor a estrutura visual do PDF.
- Foi adicionada leitura do `RESUMO GERAL` para comparar quantidade esperada de empresas/faturas com o que foi extraido.
- A tela de pre-validacao mostra o resumo esperado versus o extraido.

Validacao com o arquivo real:

- Arquivo: `C:\Users\ROYA\Downloads\relatorio_contas_receber_royal_macae (1).md`
- Empresas esperadas no resumo: 73.
- Empresas extraidas: 73.
- Faturas esperadas no resumo: 1060.
- Faturas extraidas: 1060.
- Total esperado: R$ 1.507.761,63.
- Total extraido: R$ 1.507.761,63.
- Faturas com valor zero preservadas: 62.

Comandos de validacao:

- Teste local via `npx tsx` importando `parseMarkdownReport`, `parseReceivablesSummary` e `rawTextToMarkdown`.
- `npm run lint`
- `npm run build`

### 2026-06-09 - Importador PDF/MD no padrao Faturas a Receber

Status:

- Resolvido no codigo local.

O que foi feito:

- `src/components/finance/receivablesEngine.ts` passou a expor o fluxo completo pedido para transformar texto extraido do PDF em Markdown padronizado.
- Funcoes principais disponiveis:
  - `convertExtractedReceivablesText(text)`
  - `convertExtractedReceivablesTextToMarkdown(text)`
  - `formatCnpj(value)`
  - `brlToNumber(value)`
  - `classifyInvoiceStatus(dueDate, operationDate)`
  - `validateCompanyTotals(markdown)`
- A classificacao `VENCIDO` / `A VENCER` agora usa a Data de Operacao do relatorio.
- Corrigida normalizacao de datas ISO internas para impedir inversao de dia/ano.
- O Markdown final sai sem tabela, JSON ou comentarios tecnicos.
- O parser ignora cabecalhos repetidos e tolera espacos/quebras irregulares.
- A validacao de Total Empresa compara a soma das faturas com o total informado no Markdown.

Validacao:

- Criado `scripts/receivables-parser.test.ts`.
- Criado script `npm run test:receivables`.
- Teste passou com amostra tabular do PDF.
- Teste passou com `C:\Users\ROYA\Downloads\relatorio_contas_receber_royal_macae (1).md`.
- Resultado validado no relatorio real: 73 empresas, 1060 faturas, total R$ 1.507.761,63 e Total Empresa consistente.
- `npm run lint` passou.

### 2026-06-09 - Hotfix do PDF agrupado com empresa/CNPJ separados das faturas

Problema encontrado em producao:

- O PDF estava sendo convertido pelo fallback legado.
- As faturas saiam com numero artificial `FT-178...` em vez do numero real.
- Telefones estavam entrando no nome da empresa.
- Como a Data de Operacao podia vir quebrada em outra linha, faturas antigas eram classificadas como `A VENCER`.

Correcao feita:

- `parseRawReceivablesRows` agora mantem a empresa atual quando o PDF extrai a linha da empresa/CNPJ separada das linhas de fatura.
- Criados parsers auxiliares para cabecalho de empresa e linha de fatura agrupada.
- A Data de Operacao agora aceita quebra de linha entre o rotulo e a data.
- O nome da empresa passa por limpeza de telefones antes de gerar o Markdown.
- Quando a linha nao traz todos os valores contabeis intermediarios, `Vlr Fatura` usa o valor a receber em vez de pegar comissao/telefone como valor.

Validacao:

- `npm run test:receivables` passou com amostra que reproduz o PDF agrupado.
- `npm run lint` passou.

### 2026-06-09 - Hotfix responsivo da pre-validacao do importador

Problema encontrado:

- Em viewport estreita, a tabela de pre-validacao tinha largura minima grande e explodia o painel.
- O botao `Confirmar importacao`, o resumo e a lista de linhas ficavam sobrepostos/espremidos.

Correcao feita:

- A pre-validacao agora renderiza cards editaveis no mobile.
- A tabela completa fica visivel somente em telas grandes.
- Containers receberam `min-w-0` para impedir overflow horizontal.
- Botoes da area de importacao passam a empilhar corretamente em telas pequenas.

Validacao:

- Browser local em viewport 390px: `scrollWidth` igual a `clientWidth`, sem overflow horizontal.
- `npm run lint` passou.
- `npm run test:receivables` passou.
- `npm run build` passou.

### 2026-06-09 - Reset de carteira para teste de reimportacao

Problema encontrado:

- A carteira tinha faturas antigas/importadas incorretamente e o importador acusava duplicidade ao carregar o PDF corrigido.
- Faturas marcadas como excluidas ainda podiam entrar na comparacao de duplicidade se estivessem no estado da tela.
- A migration da Regua dependia da funcao `current_user_can_manage_finance()` sem cria-la.

Correcao feita:

- Adicionado botao `Zerar faturas da Regua` na aba Importador.
- O reset marca faturas financeiras como excluidas em lotes de 100, sem apagar empresas/clientes.
- A tela passou a carregar `files` ignorando `is_deleted = true`.
- `validateImportRows` passou a ignorar faturas excluidas na deteccao de duplicidade.
- A migration agora cria `public.current_user_can_manage_finance()` antes das policies.

Validacao:

- `npm run lint` passou.
- `npm run test:receivables` passou.

## Historico de alteracoes

### 2026-06-08 - Auditoria inicial e memoria do modulo

O que foi feito:

- Lido o briefing do modulo de cobranca/inadimplencia.
- Verificado o estado atual do Royal PMS.
- Identificado que ja existe um modulo inicial em `FinanceReceivablesDesk`.
- Separado o escopo em resolvido, parcial e pendente.
- Registrado que a base atual usa `files` e `companies`, nao tabelas `clients` e `invoices`.

Por que foi feito assim:

- O projeto ja tem dados financeiros funcionando. Criar outra modelagem sem mapear a existente poderia duplicar faturas e quebrar fluxos de faturamento.

Arquivos alterados:

- `REGUA_COBRANCA_MEMORIA_TECNICA.md`

Cuidados para a proxima etapa:

- Antes de criar novas tabelas, decidir o que continua em `files` e o que vira historico/configuracao dedicada.
- Manter a regra de nao usar gateway de pagamento na regua.
- Nao tocar em Telegram/QR/vinculo Telegram.
