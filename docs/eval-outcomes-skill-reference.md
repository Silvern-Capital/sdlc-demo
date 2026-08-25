# Reference: the eval-outcomes skill

This is the staged reference copy. In the live session, Claude is asked to
create `.claude/skills/eval-outcomes/SKILL.md`; if that live creation is cut
for time, copy this file there verbatim.

---

```markdown
---
name: eval-outcomes
description: Evaluate a just-implemented feature against its stated outcomes. Runs the checks (tests, lint, page load), scores each outcome PASS or FAIL with evidence, and reports a table. Use after any feature work to prove the outcome, not just the diff.
---

# Eval - outcomes

Given a feature that was just implemented, evaluate OUTCOMES, not effort:

1. Restate the outcomes. From the request, write the checkable outcomes as
   one line each. Example for a header tagline: (a) the tagline renders,
   (b) a test asserts it, (c) nothing else changed behavior.
2. Run the evidence commands:
   - `npx playwright test` - functional truth
   - `node scripts/lint.js` - hygiene
   - `node -e 'global.window={};require("./data.js");console.log(window.STORES.length + " sites")'` - data still loads
3. Score each outcome PASS or FAIL. Quote the one line of output that
   proves it. No partial credit: unproven means FAIL.
4. Report a table: Outcome | Verdict | Evidence. End with one overall line:
   SHIP or FIX, and if FIX, the single next action.

Rules: run the commands, never infer results. Keep the report under 20
lines. Do not fix anything in this skill; evaluation only.
```
