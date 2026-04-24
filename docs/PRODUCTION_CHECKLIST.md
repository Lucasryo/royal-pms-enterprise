# Royal PMS Enterprise - Checklist de Producao

## Antes de Abrir para Operacao

- Validar a navegacao por departamento: Reservas, Recepcao, Manutencao, Restaurante, Eventos, Financeiro/Faturamento e Admin.
- Validar que o calendario espelhado aparece nos modulos internos e mostra eventos, chegadas e saidas.
- Validar Work Queue em todos os modulos: criar tarefa, enviar para outro setor, assumir, aguardar, concluir, cancelar e conferir historico/SLA.
- Aplicar `supabase_schema.sql` no projeto Supabase definitivo.
- Criar bucket privado `files` no Supabase Storage.
- Publicar `admin-create-user` e `ai-document-extract`.
- Publicar `public-booking-request` para o motor publico de reservas diretas.
- Publicar `maintenance-phone-notify` para alertas telefonicos de chamados.
- Publicar `rate-shopper-locate` para busca manual de concorrentes por cidade/localidade.
- Configurar `MAINTENANCE_NOTIFY_WEBHOOK_URL` no Supabase para o provedor escolhido de WhatsApp/SMS.
- Configurar `NOMINATIM_USER_AGENT` com identificacao do hotel/projeto e contato tecnico.
- Cadastrar telefone/WhatsApp nos perfis `maintenance`, `manager` e `admin`.
- Configurar `SUPABASE_SERVICE_ROLE_KEY` apenas como secret de Edge Function.
- Configurar `GEMINI_API_KEY` apenas como secret de Edge Function.
- Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Vercel.
- Criar e promover o primeiro usuario `admin`.
- Cadastrar o inventario real de UHs, andares e categorias em Governanca.
- Cadastrar empresas reais antes de liberar usuarios clientes.
- Testar governanca: UH suja, limpa, inspecionada, bloqueada e liberada.
- Testar operacoes: chamado de manutencao, achado e perdido, passagem de turno e visibilidade por perfil.
- Testar upload, download, comprovante, contestacao e exclusao logica de faturas.
- Testar reserva completa: solicitacao, aprovacao, check-in, checkout, fatura e auditoria.
- Testar folio: diaria automatica, consumo, estorno, transferencia de UH e transferencia de lancamentos.
- Testar POS: cadastrar item, fechar venda direta e lancar consumo em quarto ocupado.
- Testar motor publico: enviar reserva pela landing, receber notificacao e aprovar/rejeitar em Reservas.
- Testar Gestao Pro: auditoria noturna, regra tarifaria, Rate Shopper manual, fila fiscal, CRM, estoque, caixa POS, portal do hospede, Enterprise e relatorios.

## Perfis Operacionais

- `admin`: acesso completo, equipe, auditoria e configuracoes.
- `admin`: tambem visualiza o Centro de Controle Operacional com todas as Work Queues.
- `reservations`: modulo Reservas com reservas, tarifarios, contratos, revenue, rate shopper e calendario.
- `reception`: modulo Recepcao com check-in, check-out, governanca, bloqueios de UH, walk-in e folio.
- `reception`: tambem registra manutencao, achados/perdidos e passagem de turno dentro da recepcao.
- `reception`: opera POS/restaurante e lancamentos em quarto.
- `restaurant`: acesso dedicado ao POS/restaurante, com lancamentos, consulta de folio e transferencia de lancamentos, sem poderes de check-in/check-out.
- `housekeeping`: governanca, status de UHs e abertura/acompanhamento de chamados operacionais.
- `maintenance`: fila de chamados, notificacoes internas, assumir chamado, atualizar andamento, interditar/liberar UH e resolver manutencao.
- `maintenance`: modulo proprio com chamados, UHs, bloqueio/liberacao e preventiva.
- `manager`: recebe notificacoes de chamado, acompanha SLA e tem visao gerencial sem ser superadmin.
- `admin`, `manager`, `finance`, `faturamento` e `reservations`: acessam Gestao Pro conforme permissao para auditoria, revenue, fiscal, CRM, estoque, caixa e relatorios.
- `admin`, `manager` e `reservations`: podem localizar concorrentes no Rate Shopper manual, salvar hoteis monitorados e atualizar tarifa observada.
- `admin` e `manager`: operam a aba Enterprise completa, incluindo grupos, preventiva, compras, AR, seguranca operacional e multi-propriedade.
- `reservations`, `reception`, `maintenance`, `housekeeping`, `finance` e `faturamento`: participam dos fluxos enterprise conforme permissao de revenue, operacao ou financeiro.
- `reservations`: visualiza operacoes para antecipar impacto em chegada, bloqueios e troca de UH.
- `eventos`: registra pendencias operacionais de montagem, saloes e manutencao de evento.
- `finance` e `faturamento`: visualizam operacoes para entender impacto em faturamento, folio e contestacoes.
- `finance` e `faturamento`: consultam POS para conferencia de venda direta e consumo faturado.
- `faturamento` e `finance`: modulo unico Financeiro/Faturamento com faturas, documentos, baixa, extratos, rastreio, fiscal, AR e pagamentos manuais.
- `eventos`: empresas e eventos.
- `client`: portal da empresa vinculada.
- `external_client`: portal restrito, focado em reservas.

## Dados Sensiveis

- Nunca publicar `SUPABASE_SERVICE_ROLE_KEY` no Vercel como variavel `VITE_*`.
- Nunca restaurar `VITE_GEMINI_API_KEY`; chaves de IA pertencem a Edge Functions.
- Revisar politicas RLS sempre que um novo modulo criar tabela nova.
- Manter `server.ts` fora de qualquer deploy web publico.

## Smoke Test

1. Login como admin.
2. Criar empresa.
3. Criar usuario cliente vinculado a empresa.
4. Criar reserva manual.
5. Fazer check-in em uma UH disponivel.
6. Marcar a UH como suja, limpa e inspecionada em Governanca.
7. Abrir um chamado de manutencao para uma UH e resolver.
8. Login como manutencao e confirmar notificacao interna do chamado.
9. Assumir chamado como manutencao, resolver e validar historico/auditoria.
10. Login como manutencao, interditar uma UH e liberar apos manutencao.
11. Registrar um achado e perdido e marcar como retirado.
12. Registrar passagem de turno.
13. Lancar consumo no folio e emitir extrato.
14. Fechar pedido no POS como pagamento direto e como lancamento em quarto.
15. Enviar reserva publica pela landing e aprovar na central de reservas.
16. Fazer check-out e confirmar fatura em financeiro.
17. Login como cliente e validar que apenas dados da empresa aparecem.
18. Registrar contestacao e responder como financeiro.
19. Validar auditoria como admin.
20. Fechar auditoria noturna em Gestao Pro.
21. Criar regra tarifaria por temporada/categoria e conferir disponibilidade.
22. Localizar concorrentes no Rate Shopper por cidade/localidade, salvar um hotel e atualizar tarifa observada.
23. Criar bloqueio de grupo, revisar pickup e cut-off.
24. Usar o mapa visual de UHs para interditar/liberar uma UH de teste.
25. Criar preventiva, mensagem manual ao hospede, titulo em contas a receber, compra, lote de lavanderia, consumo de minibar e forecast.
26. Cadastrar controle de seguranca operacional e uma propriedade multi-hotel.
27. Enfileirar NFS-e/RPS, cadastrar perfil CRM, item de estoque e abrir caixa POS.
28. Criar uma tarefa em Reservas para Recepcao, assumir na Recepcao e concluir com nota.
29. Criar uma tarefa de Recepcao para Manutencao com SLA curto e validar alerta de vencimento.
30. Login como admin e conferir que todas as filas aparecem no Centro de Controle Operacional.
