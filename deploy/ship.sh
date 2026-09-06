#!/usr/bin/env bash
# Build the web image where there is RAM and disk, then stream it to the VM and
# restart. Usage: deploy/ship.sh ubuntu@HOST [ssh-key]
set -euo pipefail
HOST="${1:?ubuntu@host}"; KEY="${2:-$HOME/.ssh/vm.pem}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="moonlet-web:$(git -C "$ROOT" rev-parse --short HEAD)"
docker build -q -t "$TAG" -t moonlet-web:latest "$ROOT"
docker save moonlet-web:latest | gzip | ssh -i "$KEY" "$HOST" 'gunzip | docker load'
ssh -i "$KEY" "$HOST" 'cd ~/moonlet && git pull -q --ff-only && cd deploy && docker compose up -d && docker image prune -f >/dev/null && docker compose ps --format "{{.Name}} {{.Status}}"'
