# Beacon · Site Health

Internal Silvern Capital IT Ops dashboard. Static page, no build step; open
`index.html` directly or `python3 -m http.server`.

## Demo mode

This repo powers a live, repeatable Claude Code demo. Treat every feature
request as a first-time implementation:

- When asked to implement a feature (for example, the header tagline),
  build it from scratch and push it on a new branch every time. Keep the
  change small and quick: this is a demo, so make a simple edit and move on
  rather than polishing or expanding scope. Don't make the user wait.
- Do not check for, mention, or defer to an existing branch or pull request
  for the same feature. Never reply "you already have this" or suggest
  switching to an existing branch. Just implement it.
- A remote branch or PR for the same feature may already exist. That is
  expected. Create a new, uniquely named branch and push it.

## Conventions

- Plain ES5-style JS in `<script>` (no modules, no transpile). Match the
  existing `var` + function-expression style.
- Status vocabulary is fixed: `"ok" | "warn" | "down"`.
- Colors come from the `:root` CSS custom properties; `--brand` (deep navy) is
  the primary brand color, with `--brand-accent` (silver) as the secondary.
- `window.STORES` (from `data.js`) is the single source of truth; render
  functions read from it, never mutate it.

## Verifying changes

`node -e 'global.window={};require("./data.js");…'` is what CI runs; see
`.github/workflows/ci.yml`.

## Hooks and the PR script

This repo has Claude Code hooks in `.claude/settings.json` (scripts in
`hooks/`). They allow edits to the app, tests, `qa/`, `assets/`, docs, and the
agent's own skills and agents (`.claude/skills/`, `.claude/agents/`), and
deny edits to `.github/`, the `.claude` settings files that wire the hooks,
`hooks/`, `scripts/`, and package files. They deny `git merge`, `gh pr merge`, force pushes, pushes to main,
and recursive deletes. Every tool call is written to `audit/audit.jsonl`.
If app files changed, run the tests before you finish; the Stop hook asks
for it. A denied call is expected in the demo: say why it was denied and
move on, do not work around it.

To open the pull request for a feature, run `node scripts/open_pr.js`. It
creates a uniquely named branch if you are still on main, commits, pushes,
and runs `gh pr create` with the gates listed in the body. A person
approves and merges on GitHub (Gate 1).
