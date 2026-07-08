# TreadNet · Store Health

Static dashboard for monitoring JM Family Enterprises store fleet health — POS uptime, network status, open tickets, and fill-rate per location.

## Run

No build step. Open directly:

```bash
open index.html
```

or serve it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Files

- `index.html` — dashboard UI + render logic (Chart.js sparklines via CDN)
- `data.js` — store dataset, exposed as `window.STORES`
- `assets/` — JM Family Enterprises marks

## Data shape

Each store in `window.STORES`:

```js
{
  name: "Southeast Toyota Jacksonville",
  id: "1305",
  region: "FL · North Florida",
  fillRate: 96.4,
  posStatus: "ok",        // "ok" | "warn" | "down"
  netStatus: "ok",        // "ok" | "warn" | "down"
  openTickets: 1,
  daysOfSupply: 18,
  runRate7d: [212, 198, 224, 207, 231, 188, 219]
}
```

## CI

`.github/workflows/ci.yml` checks that `index.html` / `data.js` exist and that `data.js` parses and exposes a non-empty `window.STORES` array.
