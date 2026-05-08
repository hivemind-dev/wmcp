#!/usr/bin/env bash
# Usage: ./run.sh [dev|build|start]
set -euo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm install

mode="${1:-dev}"
case "$mode" in
  dev)   npm run dev ;;
  build) npm run build ;;
  start) npm run start ;;
  *) echo "Usage: $0 [dev|build|start]" >&2; exit 1 ;;
esac
