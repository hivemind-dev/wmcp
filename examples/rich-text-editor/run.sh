#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npx tsx examples/rich-text-editor/host-app.ts
