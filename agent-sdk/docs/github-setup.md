# GitHub setup: branch rules, required reviewer, CI write back

This page lists the exact commands to turn a fresh GitHub repository into the
second control layer described in `docs/two-layers.md`. Everything uses the
`gh` command line tool (https://cli.github.com). Replace `OWNER/REPO` with
your repository and `REVIEWER` with a GitHub user name.

## 1. Create the repository and push

    gh repo create OWNER/REPO --private --source . --push

Or, for an existing empty repository:

    git remote add origin https://github.com/OWNER/REPO.git
    git push -u origin main

## 2. Secrets and variables the workflows need

The review and triage workflows call Claude. Store the key as a repository
secret. If model calls should go through a proxy (for example a LiteLLM
proxy in front of Amazon Bedrock), also set the base URL as a variable and
uncomment the `ANTHROPIC_BASE_URL` lines in the two workflow files.

    gh secret set ANTHROPIC_API_KEY --repo OWNER/REPO
    gh variable set ANTHROPIC_BASE_URL --repo OWNER/REPO --body "https://litellm.example.internal"

The `CI` workflow needs no secrets.

## 3. Branch protection on main

The commands below require at least one approving review, require the `test`
job from the `CI` workflow to pass, require code owner review, and stop
anyone (including administrators) from pushing to `main` directly. The check
name is the job name in `.github/workflows/ci.yml`, which is `test`.

    gh api --method PUT -H "Accept: application/vnd.github+json" \
      /repos/OWNER/REPO/branches/main/protection \
      --input - <<'EOF'
    {
      "required_status_checks": {
        "strict": true,
        "contexts": ["test"]
      },
      "enforce_admins": true,
      "required_pull_request_reviews": {
        "dismiss_stale_reviews": true,
        "require_code_owner_reviews": true,
        "required_approving_review_count": 1
      },
      "restrictions": null,
      "allow_force_pushes": false,
      "allow_deletions": false,
      "required_linear_history": false,
      "required_conversation_resolution": true
    }
    EOF

Check what you set:

    gh api /repos/OWNER/REPO/branches/main/protection | python3 -m json.tool

Newer repositories can use rulesets instead of classic branch protection.
The equivalent ruleset:

    gh api --method POST -H "Accept: application/vnd.github+json" \
      /repos/OWNER/REPO/rulesets \
      --input - <<'EOF'
    {
      "name": "main: pull request, CI, and a human review",
      "target": "branch",
      "enforcement": "active",
      "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
      "rules": [
        { "type": "deletion" },
        { "type": "non_fast_forward" },
        { "type": "pull_request", "parameters": {
            "required_approving_review_count": 1,
            "dismiss_stale_reviews_on_push": true,
            "require_code_owner_review": true,
            "require_last_push_approval": true,
            "required_review_thread_resolution": true } },
        { "type": "required_status_checks", "parameters": {
            "strict_required_status_checks_policy": true,
            "required_status_checks": [ { "context": "test" } ] } }
      ]
    }
    EOF

## 4. A required reviewer

GitHub requires reviews from code owners when `require_code_owner_reviews`
is on. Add a `CODEOWNERS` file that names the person or team who must
approve. This is Gate 1 on GitHub.

    mkdir -p .github
    cat > .github/CODEOWNERS <<'EOF'
    # A named person must approve any change to the policy, the source, and the workflows.
    governance.py        @REVIEWER
    src/                 @REVIEWER
    tests/               @REVIEWER
    .github/workflows/   @REVIEWER
    EOF
    git add .github/CODEOWNERS
    git commit -m "Require REVIEWER to approve changes to policy, source, and workflows"
    git push

To require a team instead, write `@OWNER/team-name`. The reviewer must have
write access to the repository:

    gh api --method PUT /repos/OWNER/REPO/collaborators/REVIEWER -f permission=push

## 5. Open a pull request from the demo

After `python3 run_demo.py` and a local "approve", the feature branch is in
`workspace/`. Give that repository a remote and let the script push and open
the pull request:

    cd workspace
    git remote add origin https://github.com/OWNER/REPO.git
    cd ..
    GH_TOKEN=$(gh auth token) python3 scripts/open_pr.py

Without `GH_TOKEN` or a remote the script prints the commands it would run
and records a dry run in `pipeline/state.json`.

## 6. Writing CI and review results back to pipeline/state.json

`scripts/record_ci.py` is the write back path. It takes facts as flags and
writes the `ci`, `review`, `pr`, or `merge` stage, plus one line of Gate 2
evidence. It never calls the GitHub API.

The `CI` workflow already calls it after the test step and uploads the
updated file as an artifact named `pipeline-state`:

    - name: Record the CI result in pipeline/state.json
      if: always()
      run: |
        conclusion="${{ steps.tests.outcome == 'success' && 'success' || 'failure' }}"
        python3 scripts/record_ci.py ci --check pytest --conclusion "$conclusion" \
          --detail "${{ steps.tests.outputs.summary }}"

    - name: Upload pipeline/state.json
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: pipeline-state
        path: pipeline/state.json

To show the CI result on the local dashboard, download the artifact and copy
it over the local file:

    gh run download --repo OWNER/REPO --name pipeline-state --dir /tmp/pipeline-state
    cp /tmp/pipeline-state/state.json pipeline/state.json

Or record the result by hand from the workflow run:

    python3 scripts/record_ci.py ci --check pytest --conclusion success \
      --detail "10 passed in 0.01s" \
      --run-url "https://github.com/OWNER/REPO/actions/runs/RUN_ID"

Record the automated review verdict. The review workflow asks Claude to start
its summary comment with "Verdict: looks good" or "Verdict: changes
requested". Read it off the pull request and record it:

    verdict=$(gh pr view NUMBER --repo OWNER/REPO --comments --json comments \
      --jq '[.comments[].body | capture("Verdict: (?<v>[a-z ]+)").v] | last // "not found"')
    python3 scripts/record_ci.py review --verdict "$verdict" \
      --url "https://github.com/OWNER/REPO/pull/NUMBER"

Record the pull request and, after a person merges it, the merge:

    python3 scripts/record_ci.py pr --number NUMBER \
      --url "https://github.com/OWNER/REPO/pull/NUMBER" --state open
    python3 scripts/record_ci.py merge --merged-by REVIEWER \
      --merge-commit "$(gh pr view NUMBER --repo OWNER/REPO --json mergeCommit --jq .mergeCommit.oid)"

A workflow that runs on `push` to `main` can call the same `merge` command
with `${{ github.actor }}` and `${{ github.sha }}` and upload the file as an
artifact the same way the `CI` workflow does.

## 7. Check the whole setup

    gh api /repos/OWNER/REPO/branches/main/protection --jq '.required_pull_request_reviews'
    gh workflow list --repo OWNER/REPO
    gh pr checks NUMBER --repo OWNER/REPO
