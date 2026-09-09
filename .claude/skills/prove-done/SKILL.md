---
name: prove-done
description: Turn "done" into evidence. Restate the finish line as checks, run each one, make each green go red once in a scratch copy, and write the evidence block that goes into the pull request. Use whenever Claude is about to say a feature is done, and before opening a PR.
---

# Prove done

"Done" is a claim. This skill turns it into evidence a reviewer can read
without re-running anything. It follows the anatomy of a check: define,
measure, judge, escalate. And one rule on top: a check you have only seen
pass is not evidence. Every green must be able to go red.

## 1. Define

Restate the finish line as numbered checks. Take them from the `/goal`
condition if there is one, otherwise from the request. Each check is one
command and the one line of output that means pass. For the CSV export:

| # | Check | Command | Pass looks like |
|---|---|---|---|
| 1 | node tests green | `node --test tests/*.test.js` | `# fail 0` |
| 2 | lint clean | `node scripts/lint.js` | `lint: clean` |
| 3 | data still loads | `node -e 'global.window={};require("./data.js");console.log(window.STORES.length+" sites")'` | `6 sites` |
| 4 | export has the eight columns | `node -e 'global.window={};require("./data.js");require("./csv.js");console.log(window.toCsv(window.STORES).split("\n")[0])'` | the documented header row |

If a line of the finish line cannot be written as a command with a pass
line, say so and stop: that outcome has not been defined yet, and no amount
of running things will prove it.

## 2. Measure

Run every command. Quote the one line that proves each result. Never infer.

## 3. Go red on purpose

For every check that passed, make it fail once, in a scratch copy so the
working tree and the hooks are untouched:

```bash
T=$(mktemp -d); cp -R . "$T" 2>/dev/null; cd "$T"
```

Break the smallest thing that the check is meant to catch, run the command
there, confirm the red line, and record it. Examples: `toCsv` returning
`""` for checks 1 and 4; a `console.log(` added to `csv.js` for check 2;
`window.STORES = []` at the end of `data.js` for check 3. Then `rm -rf "$T"`.
A check that stays green when its target is broken is not a check; report
it as such.

## 4. Judge

One table, pasted, not summarised:

| # | Check | Green line (real tree) | Red line (scratch copy) | Verdict |

Verdict is PASS only when both columns are filled: green on the real tree
and red on the broken copy.

## 5. Escalate

End with one line: **DONE** if every verdict is PASS, otherwise **NOT DONE**
and the single next action. Put the whole block in your final message so it
can go into the pull request body as the evidence.

Rules: never edit, weaken or skip a test to get a green; the scratch copy is
the only place anything gets broken; `git status` must be unchanged by this
skill. This runs in your own context, so it is Claude grading work Claude
did; the `csv-reviewer` agent's independent verdict is still required.
