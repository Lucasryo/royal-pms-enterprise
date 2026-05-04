# Royal PMS Enterprise — Diretrizes do Projeto

## Responsividade (obrigatório em todas as alterações)

Todo código novo ou modificado deve ser responsivo. Sem exceção.

**Padrões obrigatórios:**

- Padding de cards: `p-4 sm:p-6` ou `p-4 sm:p-8` (nunca fixo em mobile)
- Tipografia: `text-xl sm:text-2xl sm:text-3xl` (escala pelo breakpoint)
- Tab strips: `max-w-full overflow-x-auto` + `shrink-0` em cada botão
- Grids de KPIs: `grid-cols-2 sm:grid-cols-4` (nunca `grid-cols-4` fixo)
- Tabelas: sempre dentro de `overflow-x-auto` + `min-w-[Npx]` no `<table>`
- Headers de seção: `flex flex-col sm:flex-row sm:justify-between gap-3` em vez de `flex justify-between`
- Grid items com scroll interno: adicionar `min-w-0` no item pai para evitar overflow
- Root pages com risco de overflow horizontal: `overflow-x-clip` no container raiz

**Breakpoints Tailwind usados no projeto:**

| Prefixo | Largura mínima |
|---------|---------------|
| `sm:`   | 640 px        |
| `md:`   | 768 px        |
| `lg:`   | 1024 px       |
| `xl:`   | 1280 px       |

**Checklist antes de qualquer commit:**

- [ ] Nenhum padding/tamanho de fonte fixo que quebre em telas < 640 px
- [ ] Tab strips com `overflow-x-auto`
- [ ] Tabelas com wrapper `overflow-x-auto`
- [ ] Headers não transbordam em mobile (usam `flex-col` no breakpoint base)

## Branch de desenvolvimento

Desenvolver sempre em `claude/block-bookings-by-date-VUran` (ou branch designado na sessão).

## Stack

- React + TypeScript + Vite
- Tailwind CSS (utility-first, responsividade via prefixos)
- Supabase (Postgres + Realtime)
- Vercel (deploy automático via push em `main`)
- Sonner (toasts)
- Motion/React (animações)
- Lucide React (ícones)
