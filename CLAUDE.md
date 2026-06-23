# TreadNet · Store Health

Internal BSRO IT Ops dashboard. Static page, no build step — open
`index.html` directly or `python3 -m http.server`.

## Conventions

- Plain ES5-style JS in `<script>` (no modules, no transpile). Match the
  existing `var` + function-expression style.
- Status vocabulary is fixed: `"ok" | "warn" | "down"`.
- Colors come from the `:root` CSS custom properties; `--bs-red` is the only
  brand red.
- `window.STORES` (from `data.js`) is the single source of truth — render
  functions read from it, never mutate it.

## Verifying changes

`node -e 'global.window={};require("./data.js");…'` is what CI runs; see
`.github/workflows/ci.yml`.
