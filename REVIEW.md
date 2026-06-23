# Review instructions — TreadNet / BSRO IT Ops

## What Important means here

Reserve 🔴 Important for things that would mislead store ops or break the
dashboard at runtime: wrong KPI math, a render path that throws, or status
pills that don't match the underlying `posStatus` / `netStatus`. Everything
else is 🟡 Nit.

## Cap the nits

Report at most **4 nits** per review. If there are more, mention the count in
the summary instead of posting them inline. If there are no Important
findings, open the summary with "No blocking issues."

## House rules — flag as Nit when violated

- No `console.log` / `console.debug` left in committed code (the boot banner
  in `index.html` is the only allowed one).
- Use strict equality (`===` / `!==`) everywhere.
- No unused variables or dead assignments.
- User text inputs must be `.trim()`ed before comparison or filtering.
- Status strings are exactly `"ok" | "warn" | "down"` — flag any other literal.
- Use the CSS custom properties in `:root` (e.g. `--bs-red`); don't introduce
  new hard-coded brand hex values.

## Skip

- `assets/**` (binary brand marks)
- `data.js` shape changes are fine as long as CI's parse check still passes.
