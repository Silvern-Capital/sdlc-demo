---
name: ready-for-review
description: The checklist a developer runs before asking for review, written down so it runs the same way every time. Checks scope, tests, that the new test bites, lint, and that the feature was tried, then drafts the PR text with the evidence pasted. Ends READY or NOT READY. Use before opening a pull request.
---

# Ready for review

Run this before `node scripts/open_pr.js`. Every item is a command and the
line that proves it. Quote the line; never say "passes" without it.

## 1. Scope: only the files the ticket allowed

```bash
git status --porcelain
git diff --stat
```

List every changed file. Anything outside what the ticket or the `/goal`
condition allowed is NOT READY. An edit to an existing test is NOT READY
unless the ticket asked for it; a new test file is expected.

## 2. Tests: green, and there is a test for this change

```bash
node --test tests/*.test.js
```

Pass line: `# fail 0`. Then name the test that covers this change. No such
test is NOT READY.

## 3. The new test bites

A test that passes with the change should fail without it. Prove it in a
scratch copy so nothing in the working tree moves:

```bash
T=$(mktemp -d); cp -R . "$T"; cd "$T"
# put the app back to before the change, keeping the tests:
git ls-files -m -- '*.js' '*.html' ':!tests' | xargs -r git checkout HEAD --   # revert edited app files
git ls-files -o --exclude-standard -- '*.js' '*.html' ':!tests' | xargs -r rm -f  # delete new app files
node --test tests/*.test.js; cd -; rm -rf "$T"
```

Pass line: a `not ok` for the new test. If it stays green without the
change, it is not testing the change: NOT READY.

## 4. Lint

```bash
node scripts/lint.js
```

Pass line: `lint: clean`.

## 5. The feature was tried, not only tested

Say whether `/verify` ran for this change and what it saw (the screenshot,
the downloaded file). If it did not run, say so plainly; do not claim it.

## 6. The PR text

Draft the pull request description with these headings, in this order:
**What changed** (two sentences), **Why** (the ticket in one line),
**Evidence** (the pasted output from steps 2, 3 and 4, and the
`csv-reviewer` verdict if it ran), **Look here first** (the one file or
line a reviewer should read first).

## Verdict

End with one line: **READY** if every item passed, otherwise **NOT READY:**
followed by the first item that failed and the one action that fixes it.

Rules: quote output, never summarize it; never edit a test to reach green;
the scratch copy is the only place the change is reverted. This runs in
your own context, so it is Claude checking its own work. The independent
opinion is the `csv-reviewer` agent, and the person who merges.
