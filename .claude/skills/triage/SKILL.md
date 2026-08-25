---
name: triage
description: "Triage a failing check consistently: reproduce first, then report cause and fix."
---

Triage $ARGUMENTS: 1. Run the check named in the argument (default: npx playwright test). 2. Reproduce before theorizing: quote the failing assertion verbatim from the output, never guess. 3. Locate the cause: read the file the assertion points at and name the exact line. 4. Check git log -5 for recent changes to that file. 5. Report in four lines: cause, blast radius (which tests or pages are affected), the one-line fix, and who touched the file last. Do not fix anything; report and stop.
