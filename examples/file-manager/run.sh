#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npx tsx examples/file-manager/host-app.ts
