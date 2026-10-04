#!/bin/bash
# Облачная сессия Claude Code: ставит зависимости (esbuild, three, ESLint, Playwright), чтобы сразу
# работали npm run build, npm run check и npm test. Chromium в облаке уже есть, его путь — в PW_CHROMIUM.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund

if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PW_CHROMIUM=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
