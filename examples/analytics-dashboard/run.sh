#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npx tsx examples/analytics-dashboard/host-app.ts
