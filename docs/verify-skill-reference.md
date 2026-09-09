---
name: verify
description: Drive the Beacon dashboard in a real browser and capture what a person would see. Use after any change to index.html, csv.js, data.js or serve.js to confirm the feature works at the surface, not only in the tests.
---

# Verify the Beacon dashboard

Reference copy of the project verify skill. The first `/verify` run in a
fresh checkout writes its own version to `.claude/skills/verify/SKILL.md`;
copy this file there if that run goes sideways.

## Launch

```bash
PORT=8123 node serve.js &          # any free port; :8000 may be in use by npm run serve
```

Open `http://localhost:8123/` in Claude Code's browser (the browser pane in
the desktop app, or the Claude in Chrome extension). No Claude browser?
Drive the installed Google Chrome through the repo's Playwright:
`chromium.launch({ channel: "chrome" })` from `@playwright/test`.

## What to drive

- Header: brand mark, title, Live pill. Nothing else in the header.
- Six site cards in `#grid .card`, four KPIs in `.kpi`.
- Search: type ` austin ` (padded) into `#store-search`; one card stays,
  named Silvern Capital — Austin. Type nonsense; zero cards. Clear; six.
- Console: no errors, no page errors, no leftover log lines.
- For the CSV export: click `#export-csv`, read the downloaded
  `beacon-sites.csv` with a CSV reader (quoted fields), compare row count,
  column count and the Austin row with the card on screen and with
  `GET /api/stores`. Keep the screenshot.

## Gotchas

- `serve.js` binds `0.0.0.0:<PORT>`; a command sandbox that denies network
  binds will fail with EPERM. Run it outside the sandbox.
- `/pipeline.html` is gone on purpose; a 404 there is correct.
