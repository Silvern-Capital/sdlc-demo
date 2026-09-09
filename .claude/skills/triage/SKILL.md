---
name: triage
description: Reproduce a failing check, quote the assertion, name the file and line, report cause and the one-line fix. Never fixes. Use when a check goes red.
---

Triage $ARGUMENTS:

1. Run the check named in the argument (default: `node --test tests/*.test.js`).
2. Reproduce before theorizing: quote the failing assertion verbatim from
   the output, never guess.
3. Locate the cause: read the file the assertion points at and name the
   exact line.
4. Run `git log -5 --oneline -- <that file>` for recent changes to it.
5. Report in four lines: cause, blast radius (which tests or pages are
   affected), the one-line fix, and who touched the file last.

Do not fix anything; report and stop.
