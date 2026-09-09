#!/usr/bin/env bash
# Beacon - reset the repo to the workshop baseline between runs.
#
# The baseline is ../sdlc-demo-baseline.tar.gz (shipped next to this repo).
# A full run of the workshop leaves behind: a branch (agent/...) with the
# feature committed, csv.js and tests/csv.test.js, an edited CLAUDE.md and
# data.js, the /verify skill, a worktree at ../beacon-next, and sometimes a
# dev server still listening. This script undoes all of it, locally only.
# Remote branches and pull requests on GitHub are left alone; a person
# cleans those up.
#
#   1. stop any dev server still listening on :8000 or :8123
#   2. remove worktrees other than this one, then prune
#   3. go back to main, discarding uncommitted changes
#   4. delete local agent/* branches (they were pushed; the PR has them)
#   5. restore every baseline file (never touches .git or node_modules)
#   6. delete files a live run created that are not in the baseline
#
# Regenerate the baseline after deliberate changes you want to keep, from a
# clean tree on main:
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

# 1. stray dev servers (step 1's npm run serve, the reviewer's fallback, /verify)
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti :8000 -ti :8123 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    echo "stopped dev server(s) on :8000/:8123"
  fi
fi

# 2. worktrees from step 8
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
  if [ "$wt" != "$HERE" ]; then
    git worktree remove --force "$wt" 2>/dev/null && echo "removed worktree $wt" || true
  fi
done
git worktree prune

# 3. back to main, dropping whatever the run left uncommitted
CURRENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [ "$CURRENT" != "main" ]; then
  git checkout -q -f main && echo "switched from $CURRENT back to main"
else
  git checkout -q -- . 2>/dev/null || true
fi

# 4. local agent/* branches (pushed to the PR already; local copies are noise)
git branch --list 'agent/*' | sed 's/^[* ]*//' | while read -r b; do
  [ -n "$b" ] && git branch -q -D "$b" && echo "deleted local branch $b"
done

# 5. restore the baseline files
tar -xzf "$BASELINE" -C "$HERE"

# 6. delete files a live run created that are not part of the baseline (a
# leftover csv.js or test would make the next run start green instead of
# red). Never touches .git, installed deps, or Playwright artifacts.
MANIFEST="$(mktemp)"; CURRENT_FILES="$(mktemp)"
tar -tzf "$BASELINE" | sed "s|^\./||" | sort > "$MANIFEST"
find . -type f \
  -not -path "./.git/*" -not -path "./node_modules/*" \
  -not -path "./playwright-report/*" -not -path "./test-results/*" \
  -not -path "./.claude/settings.local.json" \
  | sed "s|^\./||" | sort > "$CURRENT_FILES"
comm -13 "$MANIFEST" "$CURRENT_FILES" | while read -r extra; do
  rm -f "$extra"
  echo "removed (not in baseline): $extra"
done
rm -f "$MANIFEST" "$CURRENT_FILES"
find . -type d -empty -not -path "./.git/*" -not -path "./node_modules/*" -delete 2>/dev/null || true

echo
echo "reset done. On $(git rev-parse --abbrev-ref HEAD), git status:"
git status --short
echo "checks:"
node --test tests/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
node scripts/lint.js
