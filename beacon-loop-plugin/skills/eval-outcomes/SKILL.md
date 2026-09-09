---
name: eval-outcomes
description: Evaluate a just-implemented feature against its stated outcomes. Runs the checks (node tests, lint, data load), scores each outcome PASS or FAIL with evidence, and reports a table. Use after any feature work to prove the outcome, not just the diff.
---

# Eval - outcomes

Given a feature that was just implemented, evaluate OUTCOMES, not effort:

1. Restate the outcomes. From the request, write the checkable outcomes as
   one line each. Example for the CSV export: (a) csv.js exposes
   window.toCsv, (b) the header row is the eight documented columns,
   (c) one row per site with values equal to data.js, (d) a test in tests/
   asserts it, (e) nothing else changed behavior.
2. Run the evidence commands:
   - `node --test tests/*.test.js` - functional truth, no browser
   - `node scripts/lint.js` - hygiene
   - `node -e 'global.window={};require("./data.js");console.log(window.STORES.length + " sites")'` - data still loads
3. Score each outcome PASS or FAIL. Quote the one line of output that
   proves it. No partial credit: unproven means FAIL.
4. Report a table: Outcome | Verdict | Evidence. End with one overall line:
   SHIP or FIX, and if FIX, the single next action.

Rules: run the commands, never infer results. Keep the report under 20
lines. Do not fix anything in this skill; evaluation only. This runs in
your own context: it is Claude grading work Claude did. For an independent
opinion use the csv-reviewer agent.
