#!/usr/bin/env bash
# Copies the server keys from .env.local into the Cloudflare Pages project as encrypted secrets.
# Values are piped straight to wrangler: never printed, never written anywhere else.
# Secrets apply from the next deployment, so deploy again afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=${PROJECT:-atrium}
for k in DATABASE_URL AHOLO_API_KEY GROQ_API_KEY GORQ_API_KEY GEMINI_API_KEY NVIDIA_API_KEY LLM_MODEL PUBLIC_BASE_URL; do
  v=$(grep -E "^$k=" .env.local | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//' || true)
  [[ -z $v ]] && continue
  printf '%s' "$v" | npx wrangler pages secret put "$k" --project-name "$PROJECT" >/dev/null && echo "set $k"
done
