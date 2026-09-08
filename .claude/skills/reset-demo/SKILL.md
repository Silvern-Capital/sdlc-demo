---
name: reset-demo
description: "Reset the repo to a clean demo baseline: back to latest main, discard local changes, and delete branches left over from previous demo runs. Use at the start of a fresh demo session."
---

Reset the repo for a fresh demo run. Do each step, report what was cleaned, and stop.

1. `git checkout main` (stash or discard uncommitted changes first with `git stash -u` if the tree is dirty — tell the user a stash was made).
2. `git pull --ff-only` to get the latest main. If it fails, report and continue.
3. Delete leftover local demo branches: every local branch EXCEPT this keep-list: `main`, `demo-baseline-snapshot`, `refactor/sites-global-0812`. Use `git branch -D <name>` one branch at a time. Never touch remote branches — those are cleaned up on GitHub by a person.
4. Remove demo-generated agent files: delete `.claude/agents/site-reporter.md` if it exists (single-file delete only; leave the rest of `.claude/agents/` alone).
5. Verify: `git status` is clean and `git branch --list` shows only the keep-list. Report the branches deleted, whether a stash was created, and any step that failed.

Do not push, merge, or run recursive deletes — the repo hooks deny them and that is expected.
