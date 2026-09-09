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
- Run `node --test tests/*.test.js` after every change; it reports 0 failing.
- `node scripts/lint.js` reports 0 warnings.
- Never edit an existing test to make it pass.
- Paste the test and lint output in your final message, do not summarize it.

## Hooks in this repo
Two hooks run without being asked: the node tests after every edit, and
the node tests plus lint when you try to finish. A red result comes back to
you as a message. Fix the cause; do not work around the hook.

## Workshop mode
This repo is used for a hands-on workshop. Treat every feature request as a
first-time implementation; do not look for, mention, or defer to earlier
branches or pull requests for the same feature.
