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
#   3. go back to main, discarding uncommitted demo changes (refuses if a
#      fix branch has uncommitted edits outside the demo files)
#   4. delete local agent/* and worktree-* branches
#   5. restore every baseline file (never touches .git or node_modules)
#   6. delete files a live run created that are not in the baseline
#   7. restart the dev server on :8000 if one was running
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
    --exclude=.claude/worktrees --exclude=.claude/.cc-writes \
    .
  echo "baseline snapshot written to $BASELINE"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "No baseline tarball at $BASELINE"
  echo "Create one first: bash scripts/reset_demo.sh --snapshot"
  exit 1
fi

# 1. stray dev servers (step 1's npm run serve, the reviewer's fallback, /verify).
# Remember whether :8000 was serving so it can be restarted at the end.
HAD_SERVER=0
if command -v lsof >/dev/null 2>&1; then
  lsof -ti :8000 >/dev/null 2>&1 && HAD_SERVER=1
  PIDS="$(lsof -ti :8000 -ti :8123 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    echo "stopped dev server(s) on :8000/:8123"
  fi
fi

# 2. worktrees from step 8
# claude --worktree locks its worktrees; unlock before removing.
git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
  if [ "$wt" != "$HERE" ]; then
    git worktree unlock "$wt" 2>/dev/null || true
    git worktree remove --force "$wt" 2>/dev/null && echo "removed worktree $wt" || true
  fi
done
git worktree prune
rm -rf "$HERE/.claude/worktrees"

# 3. back to main, which is where the demo runs, dropping whatever the run
# left uncommitted. Refuse only if a non-demo branch has uncommitted edits
# to files a demo run never touches, because that is fix work in progress.
CURRENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [ "$CURRENT" != "main" ]; then
  case "$CURRENT" in
    agent/*|worktree-*) ;;
    *)
      FIXWORK="$(git status --porcelain | awk '{print $2}' | grep -v -E '^(csv\.js|index\.html|CLAUDE\.md|data\.js|tests/csv\.test\.js|\.claude/skills/verify/)' || true)"
      if [ -n "$FIXWORK" ]; then
        echo "not resetting: $CURRENT has uncommitted changes outside the demo files:"
        echo "$FIXWORK" | sed 's/^/  /'
        echo "commit or stash them, then run the reset again"
        exit 1
      fi ;;
  esac
  git checkout -q -f main && echo "switched from $CURRENT back to main"
else
  git checkout -q -- . 2>/dev/null || true
fi

# 4. local agent/* branches (pushed to the PR already; local copies are noise)
git branch --list 'agent/*' 'worktree-*' | sed 's/^[*+ ]*//' | while read -r b; do
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

# 7. put the dev server back if there was one, so the next run can start
# at the goal without typing npm run serve again
if [ "$HAD_SERVER" = "1" ]; then
  nohup node serve.js >/dev/null 2>&1 &
  sleep 1
  echo "dev server restarted on :8000"
fi
