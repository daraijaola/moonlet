#!/usr/bin/env bash
# Build the web image where there is RAM and disk, then stream it to the VM and
# restart. Usage: deploy/ship.sh ubuntu@HOST [ssh-key]
set -euo pipefail
HOST="${1:?ubuntu@host}"; KEY="${2:-$HOME/.ssh/vm.pem}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="moonlet-web:$(git -C "$ROOT" rev-parse --short HEAD)"
# WalletConnect is compiled into the client bundle, so the project id must be present at build time.
WC_ID="${NEXT_PUBLIC_WC_PROJECT_ID:-$(sed -n 's/^NEXT_PUBLIC_WC_PROJECT_ID=\s*\([^ #]*\).*/\1/p' "$ROOT/deploy/.env" 2>/dev/null)}"
docker build -q --build-arg "NEXT_PUBLIC_WC_PROJECT_ID=$WC_ID" -t "$TAG" -t moonlet-web:latest "$ROOT"
docker save moonlet-web:latest | gzip | ssh -i "$KEY" "$HOST" 'gunzip | docker load'
ssh -i "$KEY" "$HOST" 'cd ~/moonlet && git pull -q --ff-only && cd deploy && docker compose up -d --force-recreate web && docker image prune -f >/dev/null && docker compose ps --format "{{.Name}} {{.Status}}"'
