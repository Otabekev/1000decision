#!/usr/bin/env bash
# Builds the desktop app. Signing secrets are passed only when they exist:
# electron-builder treats an empty CSC_LINK as a (broken) certificate path.
set -euo pipefail
publish="${1:-never}"
for v in CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  s="S_$v"
  if [ -n "${!s:-}" ]; then export "$v=${!s}"; fi
done
extra=()
if [ -z "${CSC_LINK:-}" ]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  # No certificate: sign the Mac app ad hoc so Apple Silicon will run it.
  if [ "$(uname)" = "Darwin" ]; then extra+=(-c.mac.identity=-); fi
fi
npx electron-builder --publish "$publish" "${extra[@]+"${extra[@]}"}"
