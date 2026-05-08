#!/usr/bin/env bash
# Usage: ./run.sh [in-memory|override|http|mock]
#   in-memory (default) — single-process demo, host:requires bound directly
#   override            — same as in-memory plus host.override demo
#   http                — host:requires bound as HTTP adapters (start `mock` in another shell first)
#   mock                — runs the proxy + backend (port 3456 + 3457)
set -euo pipefail
cd "$(dirname "$0")/../.."

mode="${1:-in-memory}"
case "$mode" in
  in-memory) npx tsx examples/counter/host-app.ts ;;
  override)  npx tsx examples/counter/host-app.ts --override ;;
  http)      npx tsx examples/counter/host-app.ts --http ;;
  mock)      npx tsx examples/counter/mock-server.ts ;;
  *) echo "Usage: $0 [in-memory|override|http|mock]" >&2; exit 1 ;;
esac
