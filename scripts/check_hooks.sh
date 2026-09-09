#!/usr/bin/env bash
# Prove the two hooks can go red. Runs each hook the way Claude Code calls it
# (JSON on stdin) against a scratch copy of the repo, so nothing here touches
# your working tree. A hook you have only seen exit 0 might be checking
# nothing; this is the test button on the smoke alarm.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/hooks" "$TMP/tests" "$TMP/scripts"
cp "$HERE"/hooks/*.js "$TMP/hooks/"
cp "$HERE"/tests/*.test.js "$TMP/tests/"
cp "$HERE"/scripts/lint.js "$TMP/scripts/"
cp "$HERE"/data.js "$HERE"/index.html "$HERE"/serve.js "$TMP/"
[ -f "$HERE/csv.js" ] && cp "$HERE/csv.js" "$TMP/"
( cd "$TMP" && git init -q && git add -A && git -c user.email=x@x -c user.name=x commit -q -m base )
export CLAUDE_PROJECT_DIR="$TMP"
FAILED=0

run() {
  local name="$1" hook="$2" want="$3" json="$4"
  printf '%s' "$json" | node "$TMP/hooks/$hook" >/dev/null 2>"$TMP/err.txt"
  local got=$?
  if [ "$got" = "$want" ]; then
    echo "PASS  exit $got  $name"
  else
    echo "FAIL  exit $got (wanted $want)  $name"; head -5 "$TMP/err.txt"; FAILED=1
  fi
}

run "post: README.md is not an app file, silent"  test-changed.js 0 '{"tool_name":"Edit","tool_input":{"file_path":"README.md"}}'
run "post: data.js edit, tests green, silent"     test-changed.js 0 '{"tool_name":"Edit","tool_input":{"file_path":"data.js"}}'
run "stop: nothing changed, silent"               stop-check.js   0 '{"stop_hook_active":false}'

# Now break something on purpose: a test that must fail.
printf 'var test=require("node:test");var assert=require("node:assert");test("planted failure",function(){assert.strictEqual(1,2);});\n' > "$TMP/tests/zz-planted.test.js"
run "post: RED after a breaking edit (exit 2)"    test-changed.js 2 '{"tool_name":"Edit","tool_input":{"file_path":"data.js"}}'
run "stop: RED with app changes and a failing test" stop-check.js 2 '{"stop_hook_active":false}'
run "stop: lets a second stop through (stop_hook_active)" stop-check.js 0 '{"stop_hook_active":true}'
rm -f "$TMP/tests/zz-planted.test.js"

rm -rf "$TMP"
if [ "$FAILED" = 1 ]; then echo "SOME CHECKS FAILED"; exit 1; fi
echo "both hooks go red when they should, and stay quiet when they should"
