#!/usr/bin/env bash
# Beacon - local CI pipeline. Same jobs as .github/workflows/ci.yml, run on
# this machine, no remote and no push needed. Writes pipeline/ci_status.json
# as it goes so the pipeline page (and an agent loop polling for completion)
# can watch it finish.
#
# Usage: bash scripts/ci_local.sh
# Exit: 0 all jobs passed, 1 otherwise. Failing output lands in
# pipeline/ci_failure.log.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
RUN_ID="local-$(date +%Y%m%d-%H%M%S)"
STATUS_FILE="pipeline/ci_status.json"
FAIL_LOG="pipeline/ci_failure.log"
: > "$FAIL_LOG"

write_status() { # args: overall  then  name:status:secs triples via globals
  node -e '
    var fs = require("fs");
    var a = JSON.parse(process.argv[1]);
    fs.writeFileSync(process.argv[2], JSON.stringify(a, null, 2));
  ' "$1" "$STATUS_FILE"
}

JOBS_JSON="[]"
update() { # name status secs
  JOBS_JSON=$(node -e '
    var j = JSON.parse(process.argv[1]);
    var i = j.findIndex(function (x) { return x.name === process.argv[2]; });
    var row = { name: process.argv[2], status: process.argv[3], seconds: Number(process.argv[4]) };
    if (i === -1) j.push(row); else j[i] = row;
    console.log(JSON.stringify(j));
  ' "$JOBS_JSON" "$2" "$3" "$4")
  write_status "{\"run_id\":\"$RUN_ID\",\"status\":\"$1\",\"started\":\"$STARTED\",\"finished\":$5,\"jobs\":$JOBS_JSON}"
}

STARTED="$(date -u +%FT%TZ)"
OVERALL=passed

run_job() { # name command...
  local name="$1"; shift
  update running "$name" running 0 null
  local t0=$SECONDS
  local out
  if out=$("$@" 2>&1); then
    update running "$name" passed $((SECONDS - t0)) null
  else
    OVERALL=failed
    printf '=== job %s failed ===\n%s\n' "$name" "$out" >> "$FAIL_LOG"
    update running "$name" failed $((SECONDS - t0)) null
  fi
  echo "--- $name: $(tail -c 400 <<< "$out")"
}

run_job sanity node -e '
  global.window = {};
  require("./data.js");
  var s = window.STORES;
  if (!Array.isArray(s) || s.length === 0) throw new Error("window.STORES is not a non-empty array");
  console.log("data.js OK - " + s.length + " sites");
'
run_job lint node scripts/lint.js
run_job e2e npx playwright test
run_job coverage node scripts/coverage_report.js

FINISHED="\"$(date -u +%FT%TZ)\""
update "$OVERALL" _done_ _done_ 0 "$FINISHED"
# drop the bookkeeping row
node -e '
  var fs = require("fs");
  var s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  s.jobs = s.jobs.filter(function (j) { return j.name !== "_done_"; });
  fs.writeFileSync(process.argv[1], JSON.stringify(s, null, 2));
' "$STATUS_FILE"

echo
echo "CI ($RUN_ID): $OVERALL"
[ "$OVERALL" = passed ]
