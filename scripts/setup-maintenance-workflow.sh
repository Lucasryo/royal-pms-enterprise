#!/usr/bin/env bash
# =============================================================================
# Royal PMS — Setup automático do workflow de manutenção
# =============================================================================
# Executa TUDO: migração SQL, Edge Function, Webhook e env vars (Vercel).
#
# Pré-requisitos:
#   npx supabase   (já incluído em node_modules ou via npx)
#   npx vercel     (idem)
#   curl + jq
#
# Uso:
#   bash scripts/setup-maintenance-workflow.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${CYAN}→${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Coletar credenciais
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Royal PMS — Setup do Workflow de Manutenção           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Este script vai configurar:"
echo "  1. Migração SQL (política anon + view de fila)"
echo "  2. Edge Function de notificação (Telegram)"
echo "  3. Database Webhook (dispara Edge Function)"
echo "  4. Variável de ambiente no Vercel (VITE_IMGBB_API_KEY)"
echo ""

# --- Supabase ---
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo -e "Acesse ${CYAN}https://supabase.com/dashboard/account/tokens${NC} e gere um token de acesso."
  read -rp "Cole seu Supabase Access Token: " SUPABASE_ACCESS_TOKEN
  export SUPABASE_ACCESS_TOKEN
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo ""
  echo -e "Seu Project Ref está na URL do Supabase Dashboard: ${CYAN}https://supabase.com/dashboard/project/<REF>${NC}"
  read -rp "Cole o Project Ref (ex: abcdefghijklmnop): " SUPABASE_PROJECT_REF
  export SUPABASE_PROJECT_REF
fi

# --- Vercel ---
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo ""
  echo -e "Acesse ${CYAN}https://vercel.com/account/tokens${NC} e gere um token."
  read -rp "Cole seu Vercel Token: " VERCEL_TOKEN
fi

if [[ -z "${VERCEL_PROJECT_ID:-}" ]]; then
  echo ""
  echo -e "No Vercel Dashboard do projeto: ${CYAN}Settings → General → Project ID${NC}"
  read -rp "Cole o Vercel Project ID: " VERCEL_PROJECT_ID
fi

if [[ -z "${VERCEL_TEAM_ID:-}" ]]; then
  echo ""
  echo "(Deixe em branco se não usar uma Team account no Vercel)"
  read -rp "Vercel Team ID (opcional): " VERCEL_TEAM_ID
fi

# --- Telegram (opcional agora, pode ser feito depois) ---
echo ""
echo "Telegram — preencha DEPOIS de criar o bot no @BotFather."
echo "(Pressione Enter para pular — você pode rodar este script novamente depois)"
read -rp "TELEGRAM_BOT_TOKEN (ex: 123456:ABC-DEF...): " TELEGRAM_BOT_TOKEN
read -rp "TELEGRAM_CHAT_ID (ex: -100123456789): " TELEGRAM_CHAT_ID

SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
EDGE_FN_NAME="notify-maintenance-ticket"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ---------------------------------------------------------------------------
# 1. Aplicar migração SQL via Management API
# ---------------------------------------------------------------------------
info "Aplicando migração SQL..."

SQL_FILE="$(dirname "$0")/../supabase/migrations/20260504_public_maintenance_report.sql"
if [[ ! -f "$SQL_FILE" ]]; then
  err "Arquivo de migração não encontrado: $SQL_FILE"
fi

SQL_CONTENT=$(cat "$SQL_FILE")

MIGRATION_RESPONSE=$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(jq -Rs . <<< "$SQL_CONTENT")}")

if echo "$MIGRATION_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  warn "Resposta da migração: $(echo "$MIGRATION_RESPONSE" | jq -r '.error')"
  warn "Se o erro for 'already exists', a migração já foi aplicada — ok."
else
  ok "Migração SQL aplicada com sucesso."
fi

# ---------------------------------------------------------------------------
# 2. Deploy da Edge Function via CLI
# ---------------------------------------------------------------------------
info "Fazendo deploy da Edge Function '${EDGE_FN_NAME}'..."

(cd "$(dirname "$0")/.." && \
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  npx supabase functions deploy "$EDGE_FN_NAME" \
    --project-ref "$SUPABASE_PROJECT_REF" \
    --no-verify-jwt 2>&1) || warn "Deploy da Edge Function falhou — veja o erro acima."

ok "Edge Function deployada."

# ---------------------------------------------------------------------------
# 3. Configurar secrets da Edge Function
# ---------------------------------------------------------------------------
info "Configurando secrets da Edge Function..."

SECRETS_PAYLOAD="{\"TELEGRAM_BOT_TOKEN\":\"${TELEGRAM_BOT_TOKEN}\",\"TELEGRAM_CHAT_ID\":\"${TELEGRAM_CHAT_ID}\"}"

curl -s -X POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/secrets" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$SECRETS_PAYLOAD" > /dev/null

ok "Secrets configurados (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)."

# ---------------------------------------------------------------------------
# 4. Criar Database Webhook
# ---------------------------------------------------------------------------
info "Criando Database Webhook para maintenance_tickets..."

EDGE_FN_URL="${SUPABASE_URL}/functions/v1/${EDGE_FN_NAME}"

WEBHOOK_PAYLOAD=$(cat <<WJSON
{
  "name": "notify-maintenance-ticket",
  "enabled": true,
  "table": "maintenance_tickets",
  "schema": "public",
  "events": ["INSERT", "UPDATE"],
  "function_url": "${EDGE_FN_URL}",
  "function_headers": {}
}
WJSON
)

WEBHOOK_RESPONSE=$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/webhooks" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$WEBHOOK_PAYLOAD")

if echo "$WEBHOOK_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  ok "Database Webhook criado (ID: $(echo "$WEBHOOK_RESPONSE" | jq -r '.id'))."
else
  warn "Resposta do webhook: $(echo "$WEBHOOK_RESPONSE" | jq -r '.message // .error // .')"
  warn "Se o erro for 'already exists', tudo certo."
fi

# ---------------------------------------------------------------------------
# 5. Configurar VITE_IMGBB_API_KEY no Vercel
# ---------------------------------------------------------------------------
info "Configurando VITE_IMGBB_API_KEY no Vercel..."

TEAM_PARAM=""
[[ -n "$VERCEL_TEAM_ID" ]] && TEAM_PARAM="&teamId=${VERCEL_TEAM_ID}"

# Remove existing (ignore error if not present)
curl -s -X DELETE \
  "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?key=VITE_IMGBB_API_KEY${TEAM_PARAM}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" > /dev/null 2>&1 || true

# Add for all environments
for ENV_TARGET in production preview development; do
  curl -s -X POST \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?${TEAM_PARAM#&}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"VITE_IMGBB_API_KEY\",
      \"value\": \"e61c95ed48924d9a28500671b2be104d\",
      \"type\": \"plain\",
      \"target\": [\"${ENV_TARGET}\"]
    }" > /dev/null
done

ok "VITE_IMGBB_API_KEY configurado no Vercel (production + preview + development)."

# ---------------------------------------------------------------------------
# 6. Trigger Vercel redeploy
# ---------------------------------------------------------------------------
info "Disparando redeploy no Vercel para aplicar as novas env vars..."

DEPLOYMENTS_RESPONSE=$(curl -s \
  "https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1${TEAM_PARAM}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}")

LATEST_UID=$(echo "$DEPLOYMENTS_RESPONSE" | jq -r '.deployments[0].uid // empty')
if [[ -n "$LATEST_UID" ]]; then
  curl -s -X POST \
    "https://api.vercel.com/v13/deployments?${TEAM_PARAM#&}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"deploymentId\": \"${LATEST_UID}\", \"name\": \"royal-pms-enterprise\"}" > /dev/null
  ok "Redeploy disparado."
else
  warn "Não foi possível disparar o redeploy automaticamente. Faça um push ou redeploy manual no Vercel Dashboard."
fi

# ---------------------------------------------------------------------------
# Sumário
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup concluído!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Formulário público:  https://royal-pms.vercel.app/report/{UH}"
echo "  Board de fila:       https://royal-pms.vercel.app/board/maintenance"
echo "  QR Print (admin):    Menu → QR Manutenção"
echo ""
echo "  Pendências (você faz apenas isso):"
echo "    1. @BotFather no Telegram → /newbot → copie o token"
echo "    2. Adicione o bot ao grupo/canal → pegue o chat_id via @getidsbot"
echo "    3. Rode: npx supabase secrets set \\"
echo "         TELEGRAM_BOT_TOKEN=<token> \\"
echo "         TELEGRAM_CHAT_ID=<chat_id> \\"
echo "         --project-ref ${SUPABASE_PROJECT_REF}"
echo "    (ou preencha quando rodar este script novamente)"
echo ""
