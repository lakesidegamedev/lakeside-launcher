#!/usr/bin/env bash
# Regenerate and sign the launcher release manifest.
#
# Run by lakeside-launcher-manifest.timer. The GitHub API is read-only and the
# signing key stays outside the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${LAKESIDE_MANIFEST_OUT:-/var/www/lakeside-landing/download/launcher/manifest.json}"
KEY_FILE="${LAKESIDE_MANIFEST_KEY_FILE:-/root/.tauri/lakeside-launcher-manifest.key}"

if [[ ! -r "$KEY_FILE" ]]; then
  echo "manifest key is not readable: $KEY_FILE" >&2
  exit 1
fi

cd "$ROOT"
LAUNCHER_MANIFEST_KEY="$(cat "$KEY_FILE")" node scripts/manifest.mjs --out "$OUT"
