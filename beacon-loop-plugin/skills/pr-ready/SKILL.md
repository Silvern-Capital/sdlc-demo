---
name: pr-ready
description: Pre-PR checklist: tests, coverage, lint, diff scope, feature tried, PR text with evidence. Ends READY or NOT READY. Use before opening a pull request.
---

# PR ready

Run each item and quote the line that proves it. Never write "passes"
without the line.

## 1. Tests

```bash
node --test tests/*.test.js
```

Pass line: `# fail 0`. Name the test that covers this change; if there is
none, NOT READY.

## 2. Coverage

```bash
node --test --experimental-test-coverage tests/*.test.js
```

Paste the coverage table. Every app file you changed (`csv.js`,
`index.html` logic, `data.js`) must show at least 90% lines, and no
function at 0%. Below that, name the uncovered lines and what test would
cover them: NOT READY.

## 3. Lint

```bash
node scripts/lint.js
```

Pass line: `lint: clean`.

## 4. Scope of the diff

```bash
git status --porcelain
git diff --stat
```

Only the files the ticket allowed. An existing test edited is NOT READY
unless the ticket asked for it. New test files are expected.

## 5. The feature was tried

Say whether `/verify` ran for this change and what it saw. If it did not
run, say so; do not claim it.

## 6. The PR description

Draft it with these headings: **What changed** (two sentences), **Why**
(the ticket in one line), **Evidence** (the pasted output of 1 to 3, and
the `qa` findings if it ran), **Look here first** (the one file
a reviewer should open first).

## Verdict

One line: **READY**, or **NOT READY:** the first item that failed and the
one action that fixes it.

Rules: quote output, never summarize it; never edit a test to reach green.
Code review is not part of this; that runs on the PR.
