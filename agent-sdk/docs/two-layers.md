# Two layers of control: agent hooks and the pull request pipeline

This demo puts two independent layers of control around an AI coding agent.
The first layer runs inside the agent while it works. The second layer runs
on GitHub after the agent's branch is pushed. Each layer catches things the
other cannot, and neither trusts the agent's own account of what it did.

## Layer 1: hooks inside the agent

The agent is Claude, run through the Claude Agent SDK (a Python library that
starts the Claude Code runtime as a local process and streams back what the
agent says and does). The SDK lets you register hooks. A hook is a small
function of your own that the SDK calls at a fixed point in the agent's life.
This demo uses three of them, all defined in `governance.py`:

- PreToolUse runs before each tool call. A tool call is one action the agent
  wants to take, such as reading a file, editing a file, or running a shell
  command. The hook sees the tool name and its input and returns either
  nothing (the call proceeds) or a deny decision with a reason. On deny, the
  tool never runs and the agent is told why, so it can choose a different
  action. This is the policy gate. It blocks edits outside `src/` and
  `tests/`, blocks `git push`, `git merge`, and delete commands, and allows
  only a short list of shell commands.
- PostToolUse runs after each allowed tool call has finished. It cannot
  block anything, because the call already happened. It records a short
  view of what the tool returned, so the audit trail shows what the agent
  got back and not only what it asked for.
- Stop runs when the agent is about to end its turn. This demo uses it as an
  end marker in the trail. A Stop hook can also refuse to let the agent stop
  (for example, until the tests have been run), but this demo keeps the
  human decision at the end of the flow instead.

Every hook decision is appended to `audit/trail.jsonl` and copied into
`pipeline/state.json` as the `hook_decisions` stage. The dashboard shows them
as a table: tool, input summary, allow or deny, and the reason.

What this layer is good at: it is immediate, it is specific to the tool call,
and it works the same whether the agent is Claude through the SDK or the
canned mock transcript. The policy is a plain Python function that is easy to
read and unit test. It lives in the repository and is reviewed like any other
code.

What this layer cannot do: it only sees what happens inside this one agent
process on this one machine. It cannot stop a person from pushing an
unreviewed branch, and it cannot stop a different tool or a different agent
that was started without the hooks. That is why there is a second layer.

## Layer 2: the GitHub pull request pipeline

Once the agent is done and a person has typed "approve" at the local gate
(Gate 1), `scripts/open_pr.py` pushes the branch and opens a pull request.
From that point GitHub enforces rules that no agent and no single person can
skip:

- Branch rules (GitHub calls them branch protection or rulesets) on `main`.
  They say that nothing reaches `main` except through a pull request, that
  the required checks must pass, and that at least one approving review from
  a person is required. `docs/github-setup.md` has the exact commands.
- Required reviewers. A CODEOWNERS file names the people or team who must
  approve changes to the protected paths. GitHub will not allow a merge
  without their approval.
- CI checks. The `CI` workflow (`.github/workflows/ci.yml`) runs the test
  suite on every pull request and writes the result back into
  `pipeline/state.json` with `scripts/record_ci.py`. The agent's claim that
  tests pass is not the record; the CI run is.
- Automated code review. The `Claude Code Review` workflow
  (`.github/workflows/claude-code-review.yml`) runs
  `anthropics/claude-code-action`, the official GitHub Action for Claude
  Code. Claude reads the diff and leaves comments. It is a reviewer, not an
  approver: it cannot approve or request changes in the review UI. Its
  verdict is recorded as the `review` stage so the human reviewer sees it.
- CI triage. When the CI workflow fails, the `CI triage` workflow asks
  Claude to explain the failure in a comment on the pull request. It never
  edits code.
- Human approval as Gate 1 on GitHub. The approving review from a named
  reviewer is the same decision the local "approve" prompt asked for, now
  recorded by GitHub with a name and a timestamp. The merge button stays
  with a person.

## How the two layers fit together

| Question | Layer 1 (hooks) | Layer 2 (pull request pipeline) |
|---|---|---|
| When does it run | During the agent's work, before and after each tool call | After the branch is pushed, before it can reach `main` |
| What does it see | One tool call at a time, with its input | The whole diff, the test results, the review comments |
| Who enforces it | Your code, in `governance.py` | GitHub, through branch rules and required checks |
| Can the agent bypass it | Not from inside the session; the SDK calls the hook before every tool call | No; the rules apply to every push and every person |
| What does it record | `audit/trail.jsonl` and the `hook_decisions` stage | The `pr`, `ci`, `review`, and `merge` stages, plus GitHub's own history |

Gate 1 is the human approval. It appears twice on purpose: once locally in
`run_demo.py`, where a person reads the diff and types "approve", and once on
GitHub as the required review. Gate 2 is validation evidence: the test run
the runner executed itself, the commit message trailers that carry the
requirement id, and the CI result GitHub recorded. The dashboard shows both
gates side by side so it is easy to answer "who approved this, and what was
the evidence at the time".

## What to say when someone asks "why both"

The hooks are the fast, fine grained control that shapes what the agent can
do while it works. The pull request pipeline is the slow, coarse control
that decides what reaches the main branch, and it applies to agents and
people alike. Removing either one leaves a gap: without hooks the agent can
waste time on actions it was never allowed to take, and the trail loses the
per call detail; without the pipeline there is nothing that stops an
unreviewed push. Together they give a trail from the requirement, through
each tool call, to the test, the review, the approval, and the merge.
