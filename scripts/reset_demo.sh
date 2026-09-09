#!/usr/bin/env bash
# Beacon - reset the repo to the workshop baseline between runs. No git writes.
#
# The baseline is ../sdlc-demo-baseline.tar.gz (shipped next to this repo).
# Restoring:
#   1. restore every baseline file (never touches .git or node_modules)
#   2. delete files a live run created that are not in the baseline: csv.js,
#      tests/csv.test.js, the /verify skill, a downloaded CSV, and so on
#
# Regenerate the baseline after deliberate changes you want to keep, from a
# tree that is in the state you want participants to start from:
#   bash scripts/reset_demo.sh --snapshot
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
BASELINE="$HERE/../sdlc-demo-baseline.tar.gz"

if [ "${1:-}" = "--snapshot" ]; then
  tar -czf "$BASELINE" \
    --exclude=./.git --exclude=node_modules \
    --exclude=playwright-report --exclude=test-results \
    --exclude=.claude/settings.local.json \
    .
  echo "baseline snapshot written to $BASELINE"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "No baseline tarball at $BASELINE"
  echo "Create one first: bash scripts/reset_demo.sh --snapshot"
  exit 1
fi

tar -xzf "$BASELINE" -C "$HERE"

# Delete files a live run created that are not part of the baseline (a
# leftover csv.js or test would make the next run start green instead of
# red). Never touches .git, installed deps, or Playwright artifacts.
MANIFEST="$(mktemp)"; CURRENT="$(mktemp)"
tar -tzf "$BASELINE" | sed "s|^\./||" | sort > "$MANIFEST"
find . -type f \
  -not -path "./.git/*" -not -path "./node_modules/*" \
  -not -path "./playwright-report/*" -not -path "./test-results/*" \
  -not -path "./.claude/settings.local.json" \
  | sed "s|^\./||" | sort > "$CURRENT"
comm -13 "$MANIFEST" "$CURRENT" | while read -r extra; do
  rm -f "$extra"
  echo "removed (not in baseline): $extra"
done
rm -f "$MANIFEST" "$CURRENT"
find . -type d -empty -not -path "./.git/*" -not -path "./node_modules/*" -delete 2>/dev/null || true

echo
echo "reset done. Baseline restored; the checks should be green:"
node --test tests/*.test.js 2>&1 | tail -4
node scripts/lint.js
