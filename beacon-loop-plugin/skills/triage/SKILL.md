---
name: triage
description: "Triage a failing check the same way every time: reproduce first, quote the failing assertion, name the file and line, report cause, blast radius and the one-line fix. Does not fix anything."
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
