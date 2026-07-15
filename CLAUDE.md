# Beacon · Site Health

Internal Silvern Capital IT Ops dashboard. Static page, no build step — open
`index.html` directly or `python3 -m http.server`.

## Conventions

- Plain ES5-style JS in `<script>` (no modules, no transpile). Match the
  existing `var` + function-expression style.
- Status vocabulary is fixed: `"ok" | "warn" | "down"`.
- Colors come from the `:root` CSS custom properties; `--brand` (deep navy) is
  the primary brand color, with `--brand-accent` (silver) as the secondary.
- `window.STORES` (from `data.js`) is the single source of truth — render
  functions read from it, never mutate it.

## Verifying changes

`node -e 'global.window={};require("./data.js");…'` is what CI runs; see
`.github/workflows/ci.yml`.
