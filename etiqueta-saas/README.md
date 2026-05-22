# Etiqueta — SaaS de Validade de Alimentos

SaaS web para cozinhas comerciais cadastrarem produtos e imprimirem etiquetas
térmicas de validade (manipulação/abertura), com multi-empresa, usuário master,
e envio de fotos com autoexclusão em 30 dias.

> Este projeto é **independente** do repositório `royal-pms-enterprise` onde foi
> versionado inicialmente. Ele vive na pasta `etiqueta-saas/` apenas por uma
> limitação de ferramentas — veja "Mover para o repositório próprio" abaixo.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Supabase · React Router ·
sonner · lucide-react · date-fns · jsPDF.

## Pré-requisitos

- Node 20+ e npm.
- Um projeto Supabase (este projeto aponta para `glvdiicipblsohdgmqaz`).

## Rodando localmente

```bash
cd etiqueta-saas
npm install
cp .env.example .env      # preencha VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm run lint              # checagem de tipos (tsc --noEmit)
```

## Configurar o backend Supabase

As migrations estão em `supabase/migrations/`. Aplique **na ordem**, pelo
**SQL Editor** do painel Supabase (ou pela API de gerenciamento):

1. `0001_init.sql` — tabelas, enums, índices, triggers.
2. `0002_rls.sql` — Row Level Security (isolamento por empresa).
3. `0003_storage.sql` — bucket privado `photos` + políticas de Storage.
4. `0004_cron_cleanup.sql` — **somente depois** de fazer o deploy da function
   `cleanup-photos` e definir o segredo `CLEANUP_SECRET` (instruções no arquivo).

### Criar o usuário master

1. No painel Supabase → **Authentication → Users → Add user** (defina e-mail e
   senha; marque e-mail como confirmado).
2. No **SQL Editor**, promova o usuário a master:
   ```sql
   update public.profiles
   set role = 'master', company_id = null
   where email = 'email-da-nutricionista@exemplo.com';
   ```
3. Faça login no app. Os demais usuários são criados pela tela **Usuários**.

### Edge Functions

Deploy via Supabase CLI (`supabase functions deploy <nome>`) ou pelo dashboard:

- **`admin-create-user`** — criação de usuários pelo master. `verify_jwt = true`.
- **`cleanup-photos`** — limpeza diária de fotos. `verify_jwt = false`.
  Defina a variável `CLEANUP_SECRET` (string aleatória) nas configs da function;
  use o mesmo valor em `0004_cron_cleanup.sql`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas
automaticamente pelo Supabase nas Edge Functions.

### Testar a limpeza de fotos manualmente

```bash
curl -X POST 'https://glvdiicipblsohdgmqaz.functions.supabase.co/cleanup-photos' \
  -H 'x-cleanup-secret: SEU_CLEANUP_SECRET'
```

Para simular uma foto antiga, no SQL Editor:
`update photos set uploaded_at = now() - interval '31 days' where id = '...';`

## Deploy (Vercel)

Crie um projeto na Vercel com **Root Directory = `etiqueta-saas/`**, defina as
variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O `vercel.json` já
configura o rewrite de SPA.

## Mover para o repositório próprio

Para extrair este projeto para `github.com/lucaszaous-creator/ProActive7`:

```bash
cp -r etiqueta-saas/* etiqueta-saas/.gitignore etiqueta-saas/.env.example /caminho/ProActive7/
cd /caminho/ProActive7 && git add . && git commit -m "Importa Etiqueta SaaS" && git push
```

Nenhum arquivo depende do código do `royal-pms-enterprise`.

## Limitações conhecidas

- **Impressão térmica:** a etiqueta sai pelo diálogo/driver do sistema
  operacional. Configure o driver uma vez: papel no tamanho da etiqueta,
  margens zero, sem cabeçalho/rodapé, escala 100%. Impressão crua (ESC/POS/ZPL)
  sem diálogo exige Web Serial/WebUSB — fora do MVP.
- **iOS/Safari:** suporte fraco a `@page`; prefira imprimir de um desktop.
- **Conformidade ANVISA:** o layout da etiqueta deve ser validado pela
  nutricionista responsável.
