#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

node --check config.js
node --check github-auth.js
node --check github-service.js
node --check ai-service.js
node --check popup.js
node tests/run-tests.js

if grep -q 'YOUR_GITHUB_CLIENT_ID' config.js; then
  echo "error: replace YOUR_GITHUB_CLIENT_ID in config.js before packaging" >&2
  exit 1
fi

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/ai-repo-finder-for-github-$VERSION.zip"
FILES="manifest.json popup.html popup.js styles.css config.js github-auth.js github-service.js ai-service.js PRIVACY.md LICENSE icons/icon16.png icons/icon48.png icons/icon128.png"

rm -rf dist
mkdir -p dist
zip -q "$OUT" $FILES

if unzip -l "$OUT" | grep -Eq '(tests/|\.git/|\.DS_Store|SOURCE_BASELINE|README\.md|store/|scripts/)'; then
  echo "error: development files leaked into package" >&2
  exit 1
fi

printf '%s\n' "Created $OUT"
