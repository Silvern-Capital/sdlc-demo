# Beacon · Site Health

Internal IT-Ops dashboard for the Silvern Capital site fleet. Static page,
no build step. `npm run serve` serves it on :8000 with the API at /api/stores.

## Conventions
- Plain ES5 inside <script>: var and function expressions, no modules.
- Status vocabulary is fixed: "ok" | "warn" | "down".
- window.STORES (from data.js) is the single source of truth. Read it,
  never mutate it.
- Colors come from the :root custom properties in index.html.

## What done means, for any change
- A test in tests/ asserts the new behavior. Write it first; watch it fail.
- Never edit an existing test to make it pass.
- Paste the test and lint output in your final message, do not summarize it.

## Workshop mode
This repo is used for a hands-on workshop. Treat every feature request as a
first-time implementation; do not look for, mention, or defer to earlier
branches or pull requests for the same feature.
