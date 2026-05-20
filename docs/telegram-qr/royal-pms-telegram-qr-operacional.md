# Royal PMS - Manual de Uso QR Telegram e Chamados

Passo a passo operacional para novos colaboradores

Versao: 1.0
Data: 20/05/2026
Escopo: cadastro de camareira, abertura de chamado por QR, operacao no Telegram, vistoria e avaliacao.

Este manual explica o que cada pessoa deve fazer no dia a dia. Ele foi escrito para treinamento e continuidade operacional.

## Indice

1. Quem participa do fluxo
2. Fluxo completo
3. Cadastro da camareira
4. Vinculo PMS com Telegram
5. Abrir chamado pelo QR Code
6. Recebimento no Telegram
7. Falta de pecas
8. Conclusao e vistoria
9. Avaliacao final
10. Checklist diario
11. Checklist de entrada de novo colaborador
12. Quando chamar suporte tecnico

## 1. Quem participa do fluxo

| Perfil | Responsabilidade |
| --- | --- |
| Administrador PMS | Cadastra camareiras, gera vinculo Telegram e acompanha permissoes. |
| Camareira | Abre chamado pelo QR Code do quarto usando PIN. |
| Manutencao | Recebe o chamado no Telegram, assume, executa e atualiza status. |
| Inspetor/Supervisor | Confere o servico, aprova ou reprova. |
| Gestao | Acompanha qualidade, avaliacao e pendencias. |

## 2. Fluxo completo

```text
1. Admin cadastra camareira
2. Admin define PIN
3. Admin vincula equipe ao Telegram
4. Camareira escaneia QR do quarto
5. Camareira informa PIN
6. Camareira abre chamado
7. Telegram recebe card
8. Tecnico assume
9. Tecnico executa ou marca falta de pecas
10. Chamado vai para vistoria quando aplicavel
11. Supervisor aprova ou reprova
12. Chamado recebe avaliacao final
```

## 3. Cadastro da camareira

Responsavel: Administrador PMS.

Passo a passo:

1. Abrir o PMS.
2. Entrar na area de cadastro/governanca de camareiras.
3. Criar nova camareira ou localizar cadastro existente.
4. Preencher nome.
5. Informar andar principal de trabalho.
6. Informar telefone, se disponivel.
7. Definir PIN de 4 digitos.
8. Salvar.
9. Confirmar se o cadastro esta ativo.

Boas praticas:

- Nao usar PIN obvio para todos, como 0000 ou 1234.
- Trocar o PIN quando houver suspeita de uso indevido.
- Inativar a camareira quando ela sair da equipe.
- Manter o andar correto para facilitar acompanhamento.

## 4. Vinculo PMS com Telegram

Responsavel: Administrador PMS.

O vinculo e necessario para que o PMS saiba qual colaborador esta usando o Telegram.

Passo a passo:

1. Abrir Admin no PMS.
2. Entrar em Cadastro.
3. Abrir a area de Telegram/permissoes.
4. Escolher o usuario PMS.
5. Escolher o papel correto: Tecnico, Vistoria ou Admin.
6. Gerar o codigo de vinculo.
7. Pedir para o colaborador abrir o Telegram.
8. No chat do bot/grupo configurado, enviar `/vincular CODIGO`.
9. Conferir no PMS se o vinculo apareceu.

Quando revogar:

- Colaborador saiu da empresa.
- Celular foi trocado ou perdido.
- Usuario foi vinculado ao papel errado.
- Existe suspeita de uso indevido.

## 5. Abrir chamado pelo QR Code

Responsavel: Camareira.

Passo a passo:

1. Escanear o QR Code do quarto/unidade.
2. Aguardar a tela de chamado abrir.
3. Informar o PIN de 4 digitos.
4. Confirmar se o quarto exibido esta correto.
5. Escolher a prioridade.
6. Informar um titulo curto, por exemplo: `Ar condicionado nao liga`.
7. Descrever o problema com detalhes uteis.
8. Anexar foto quando ajudar a manutencao.
9. Enviar chamado.
10. Confirmar que a tela informou o envio.

Como escolher prioridade:

| Prioridade | Quando usar |
| --- | --- |
| Baixa | Problema simples, sem impacto imediato no hospede. |
| Media | Problema que precisa de acompanhamento no turno. |
| Alta | Impacta uso do quarto ou experiencia do hospede. |
| Urgente | Risco, impossibilidade de uso ou situacao que exige resposta imediata. |

Boas descricoes:

- Informe o local exato dentro do quarto.
- Diga o que foi observado.
- Evite apenas escrever "problema" ou "quebrado".
- Tire foto quando o problema for visual.

## 6. Recebimento no Telegram

Responsavel: Equipe de manutencao.

Quando o chamado e criado, o bot publica um card no Telegram com as informacoes principais. O tecnico deve:

1. Ler quarto, prioridade e descricao.
2. Clicar em `Assumir`.
3. Ir ate o local.
4. Executar o servico ou registrar impedimento.

Botoes mais comuns:

| Botao | Quando usar |
| --- | --- |
| Assumir | Quando voce vai cuidar do chamado. |
| Concluir | Quando o problema foi resolvido. |
| Falta de Pecas | Quando nao e possivel finalizar por falta de material. |
| Pecas Recebidas | Quando o material chegou e o chamado pode continuar. |
| Adicionar nota | Para registrar informacao importante. |
| Transferir | Quando outro tecnico deve continuar. |
| Ver detalhes | Para abrir mais informacoes do chamado. |

Comando util:

- `/meus`: mostra chamados em andamento ligados ao seu usuario Telegram.

## 7. Falta de pecas

Responsavel: Tecnico de manutencao.

Use `Falta de Pecas` quando o chamado nao pode ser concluido por falta de material, ferramenta ou item necessario.

Depois de marcar falta de pecas:

1. Escreva quais pecas faltam.
2. Aguarde compra, estoque ou liberacao.
3. Quando o material chegar, use `Pecas Recebidas`.
4. Continue o atendimento.
5. Conclua quando resolver.

## 8. Conclusao e vistoria

Responsavel: Tecnico e inspetor/supervisor.

Quando o tecnico conclui, o chamado pode seguir para conferencia. O inspetor/supervisor deve:

1. Abrir o card no Telegram.
2. Clicar em `Assumir Vistoria`.
3. Conferir o local.
4. Clicar em `Aprovar` se o servico ficou correto.
5. Clicar em `Reprovar` se ainda houver problema.

Se reprovar:

- O chamado volta para manutencao.
- A equipe deve corrigir o ponto informado.
- Depois deve concluir novamente.

Se aprovar:

- O chamado segue para encerramento/avaliacao.

## 9. Avaliacao final

Responsavel: pessoa autorizada no fluxo definido pela operacao.

Quando aparecer avaliacao de 1 a 5 estrelas:

- 1 estrela: servico ruim ou problema nao resolvido.
- 2 estrelas: resolvido com muitas falhas.
- 3 estrelas: aceitavel.
- 4 estrelas: bom.
- 5 estrelas: excelente.

A avaliacao ajuda a medir qualidade da manutencao e identificar recorrencias.

## 10. Checklist diario

Administrador ou supervisor:

- Conferir se existem chamados abertos sem responsavel.
- Conferir chamados aguardando pecas.
- Conferir chamados parados em vistoria.
- Confirmar se o bot esta publicando cards normalmente.
- Verificar se novos colaboradores estao vinculados ao Telegram.

Manutencao:

- Usar `/meus` no inicio do turno.
- Assumir chamados antes de executar.
- Registrar falta de pecas quando houver bloqueio.
- Concluir apenas quando o problema estiver resolvido.

Camareiras:

- Usar QR correto do quarto.
- Informar PIN proprio.
- Descrever problema com clareza.
- Enviar foto quando necessario.

## 11. Checklist de entrada de novo colaborador

Para camareira:

- Criar cadastro no PMS.
- Definir PIN.
- Confirmar andar.
- Explicar como escanear QR.
- Fazer um teste assistido.

Para manutencao:

- Criar ou confirmar usuario PMS.
- Gerar codigo de vinculo Telegram.
- Colaborador envia `/vincular CODIGO`.
- Definir papel `Tecnico`.
- Testar recebimento e botao `Assumir`.

Para inspetor/supervisor:

- Criar ou confirmar usuario PMS.
- Gerar codigo de vinculo Telegram.
- Definir papel `Vistoria` ou `Admin`, conforme responsabilidade.
- Testar fluxo de assumir vistoria.

## 12. Quando chamar suporte tecnico

Chame suporte tecnico quando:

- QR abre, mas nao valida o quarto.
- PIN correto nao entra.
- Chamado e criado, mas nao aparece no Telegram.
- Botao do Telegram retorna erro.
- Card nao atualiza depois de assumir ou concluir.
- Vinculo `/vincular CODIGO` nao funciona.
- Avaliacao nao aparece ou nao registra.

Ao pedir suporte, envie:

- Quarto/unidade.
- Nome da camareira ou colaborador.
- Horario aproximado.
- Print do erro, se existir.
- Acao que estava sendo feita.
