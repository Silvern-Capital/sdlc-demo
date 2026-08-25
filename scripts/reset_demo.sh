#!/usr/bin/env bash
# Beacon - reset the repo to the demo baseline between runs. No git writes.
#
# The baseline is ../sdlc-demo-baseline.tar.gz (shipped next to this repo in
# the handoff zip). Restoring:
#   1. git checkout main (your normal between-runs step; branches from demo
#      runs are left alone, same as the DEMO-SDLC.md runbook)
#   2. restore all demo files from the baseline tarball (never touches .git,
#      node_modules, or the Python venvs)
#   3. clear pipeline state and the audit log (reset_pipeline.js)
#   4. remove anything a live session created (site-reporter agent, CI
#      status files). The eval-outcomes skill is now a committed baseline
#      file, so it is kept.
#
# Regenerate the baseline after deliberate changes you want to keep:
#   bash scripts/reset_demo.sh --snapshot
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
BASELINE="$HERE/../sdlc-demo-baseline.tar.gz"

if [ "${1:-}" = "--snapshot" ]; then
  # exclude only the TOP-level .git; agent-sdk/workspace/.git is demo
  # fixture and must be part of the baseline
  tar -czf "$BASELINE" \
    --exclude=./.git --exclude=node_modules --exclude=.venv \
    --exclude=agent-sdk/.venv --exclude=playwright-report \
    --exclude=test-results --exclude=pipeline/ci_status.json \
    --exclude=pipeline/ci_failure.log --exclude=pipeline/coverage.json \
    .
  echo "baseline snapshot written to $BASELINE"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "No baseline tarball at $BASELINE"
  echo "Create one first: bash scripts/reset_demo.sh --snapshot"
  exit 1
fi

# (note: this checkout is a no-op on files when already on main; git may
# append a reflog line, which is the only git metadata this script touches)
git checkout main 2>/dev/null || true
tar -xzf "$BASELINE" -C "$HERE"

# Delete files a live run created that are not part of the baseline (a
# leftover test for a reverted feature would fail the next run). Never
# touches .git, installed deps, or Playwright artifacts.
tar -tzf "$BASELINE" | sed "s|^\./||" | sort > /tmp/beacon-baseline-manifest.txt
find . -type f \
  -not -path "./.git/*" -not -path "./node_modules/*" \
  -not -path "./.venv/*" -not -path "./agent-sdk/.venv/*" \
  -not -path "./playwright-report/*" -not -path "./test-results/*" \
  | sed "s|^\./||" | sort > /tmp/beacon-current-manifest.txt
comm -13 /tmp/beacon-baseline-manifest.txt /tmp/beacon-current-manifest.txt | while read -r extra; do
  rm -f "$extra"
  echo "removed (not in baseline): $extra"
done
find . -type d -empty -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.claude/.cc-writes*" -delete 2>/dev/null || true
mkdir -p .claude/.cc-writes

node scripts/reset_pipeline.js
rm -rf .claude/agents/site-reporter.md
rm -f pipeline/ci_status.json pipeline/ci_failure.log pipeline/coverage.json

echo
echo "reset done - baseline restored, pipeline cleared; lint should now show 5 staged warnings:"
node scripts/lint.js || true
