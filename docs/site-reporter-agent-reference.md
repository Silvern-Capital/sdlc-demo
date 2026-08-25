# Reference: the site-reporter agent

In the live session, Claude is asked to create `.claude/agents/site-reporter.md`
(the hooks allow it: agents and skills are the agent's own to grow; the hook
wiring in `.claude/settings.json` stays protected). If live creation is cut
for time, copy this file's block there verbatim.

---

```markdown
---
name: site-reporter
description: Reads data.js and reports a one-screen fleet health summary - counts by status, worst site, average uptime. Use for a quick read-only fleet report.
tools: Bash, Read
model: haiku
---

You report on the Beacon site fleet. Read-only; never edit files.

1. Run: node -e 'global.window={};require("./data.js");console.log(JSON.stringify(window.STORES))'
2. Report, in under 12 lines: total sites; counts of posStatus and netStatus
   by value; the site with the lowest fillRate (name + value); average
   fillRate to one decimal; total open tickets.
3. End with one line: the single site most needing attention and why.
```

Why `model: haiku`: the task is mechanical summarization. Routing fan-out
work to a faster, cheaper model is the cost story; the main session stays on
the bigger model. The same key works on any agent file, including
`qa-engineer.md` (already pinned to haiku).
