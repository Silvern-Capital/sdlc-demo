---
name: autocover
description: Raise test coverage on the app files by writing the missing node tests. Reads the coverage table, finds uncovered lines and functions in the app code, writes new test files that exercise them, re-runs, and reports before and after. Never edits app code or existing tests. Use when /pr-ready reports coverage below the bar.
---

# Autocover

## 1. Measure

```bash
node --test --experimental-test-coverage tests/*.test.js
```

Paste the coverage table. Note every app file (`csv.js`, `data.js`,
`serve.js`, the script in `index.html` if it is under test) with lines
below 90% or any function at 0%, and the uncovered line numbers.

## 2. Read the uncovered lines

Open each file at those lines. Say in one line per gap what behavior is
untested: a branch (a field with a comma, an empty list, an unknown id),
an error path, a function nobody calls.

## 3. Write the tests

One new file per app file, `tests/<name>.cover.test.js`, plain `node:test`,
loading the code the way `tests/data.test.js` does. Each test targets one
gap and asserts a real outcome, not just that the function ran. Do not
edit any existing test. Do not edit app code; if a line cannot be reached
from outside, say so and leave it.

## 4. Measure again

Run the coverage command again and paste the table. Stop when every app
file is at 90% lines or above with no function at 0%, or when the only
uncovered lines are ones you named as unreachable.

## Report

Two tables, before and after, then one line per new test: file, what it
covers. Then `node --test tests/*.test.js` output showing `# fail 0`.

Rules: new tests must fail if the behavior they cover is removed; if you
cannot say what would make a test fail, do not write it. Never edit app
code or existing tests.
