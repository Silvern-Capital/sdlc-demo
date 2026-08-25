// Beacon · Pipeline page. Plain ES5, no build step, no libraries.
// Reads pipeline/state.json and audit/audit.jsonl over HTTP (serve.js or
// python3 -m http.server) and renders the Create Loop stages.
var STAGES = [
  { key: "requirement", label: "Requirement" },
  { key: "branch", label: "Branch" },
  { key: "changes", label: "Code + tests" },
  { key: "tests", label: "Tests run" },
  { key: "gates", label: "Hooks / gates" },
  { key: "pr", label: "Pull request" },
  { key: "ci", label: "CI" },
  { key: "review", label: "Claude review" },
  { key: "gate1", label: "Gate 1 (human)" },
  { key: "merge", label: "Merge" }
];
var REFRESH_MS = 3000;
var AUDIT_ROWS = 40;

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shortTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function statusPill(status) {
  var cls = status == "done" ? "ok" : status == "running" ? "warn" : status == "failed" ? "down" : "";
  return '<span class="pill ' + cls + '"><span class="dot"></span>' + esc(status || "pending") + '</span>';
}

function stage(state, key) {
  return (state && state.stages && state.stages[key]) || { status: "pending" };
}

function fetchText(url) {
  return fetch(url + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.text();
  });
}

function parseJsonl(text) {
  var out = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch (e) { /* skip bad line */ }
  }
  return out;
}

function renderStrip(state) {
  document.getElementById("strip").innerHTML = STAGES.map(function (s, i) {
    var st = stage(state, s.key);
    return '<div class="stage ' + esc(st.status) + '">' +
      '<div class="n">' + (i + 1) + '</div>' +
      '<div class="t">' + esc(s.label) + '</div>' +
      '<div class="s">' + esc(st.status || "pending") + '</div>' +
    '</div>';
  }).join("");
}

function kv(label, value, mono) {
  if (value === undefined || value === null || value === "") return "";
  return '<div><b>' + esc(label) + ':</b> ' + (mono ? '<code>' + esc(value) + '</code>' : value) + '</div>';
}

function link(url) {
  if (!url) return "";
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>';
}

function card(title, status, body) {
  return '<div class="card"><h3>' + esc(title) + statusPill(status) + '</h3><div class="kv">' + body + '</div></div>';
}

function renderCards(state) {
  var req = stage(state, "requirement");
  var br = stage(state, "branch");
  var ch = stage(state, "changes");
  var te = stage(state, "tests");
  var ga = stage(state, "gates");
  var pr = stage(state, "pr");
  var ci = stage(state, "ci");
  var rv = stage(state, "review");
  var g1 = stage(state, "gate1");
  var mg = stage(state, "merge");

  var html = "";
  html += card("1 · Requirement", req.status,
    (req.text ? '<div class="req">' + esc(req.text) + '</div>' : '<div class="muted">No requirement recorded yet. The first prompt of a Claude Code session is written here by the UserPromptSubmit hook.</div>') +
    (req.notes && req.notes.length ? kv("Follow-ups", esc(req.notes.join(" / "))) : "") +
    kv("At", shortTime(req.at)));
  html += card("2 · Branch", br.status, kv("Name", br.name, true) + kv("Created", shortTime(br.at)) +
    (!br.name ? '<div class="muted">Recorded when the agent runs git checkout -b, or by scripts/open_pr.js.</div>' : ""));
  html += card("3 · Code + tests", ch.status,
    (ch.files && ch.files.length ? kv("Files edited", ch.files.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join(", ")) : '<div class="muted">No files edited yet.</div>') +
    (ch.test_files && ch.test_files.length ? kv("Test files", ch.test_files.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join(", ")) : "") +
    kv("Last edit", shortTime(ch.last_edit_at)));
  html += card("4 · Tests run", te.status,
    kv("Kind", te.kind) + kv("Command", te.command, true) +
    kv("Result", te.passed === true ? '<span style="color:var(--ok);font-weight:600">pass</span>' : te.passed === false ? '<span style="color:var(--down);font-weight:600">fail</span>' : "") +
    kv("Summary", esc(te.summary)) + kv("At", shortTime(te.at)) +
    (te.stale_since ? '<div class="muted">App files changed after the last run. The Stop hook requires a new run before the agent may finish.</div>' : "") +
    (!te.command && !te.stale_since ? '<div class="muted">No test command seen yet. Playwright, the migration check, and the data.js sanity check all count.</div>' : ""));
  html += card("5 · Hooks / gates", ga.status,
    kv("Allowed", ga.allowed || 0) + kv("Denied", ga.denied || 0) +
    (ga.last ? kv("Last decision", '<code>' + esc(ga.last.tool) + '</code> ' + esc(ga.last.target) + ' <span class="' + (ga.last.decision === "deny" ? "deny" : "allow") + '" style="color:var(--' + (ga.last.decision === "deny" ? "down" : "ok") + ');font-weight:600">' + esc(ga.last.decision) + '</span> <span class="muted">(' + esc(ga.last.reason) + ')</span>') : "") +
    '<div class="muted">PreToolUse checks every edit and shell command against hooks/policy.js. PostToolUse records results. Stop requires a test run after any app edit.</div>');
  html += card("6 · Pull request", pr.status,
    kv("Branch", pr.branch, true) + kv("Number", pr.number ? "#" + pr.number : "") + kv("Title", esc(pr.title)) + kv("URL", link(pr.url)) +
    kv("Mode", pr.dry_run ? "dry run (no push)" : "") + kv("Note", esc(pr.note)) +
    (!pr.branch ? '<div class="muted">Run node scripts/open_pr.js to commit, push a uniquely named branch, and open the PR with the gates listed in its body.</div>' : ""));
  html += card("7 · CI", ci.status,
    (ci.checks && ci.checks.length ? '<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>' + ci.checks.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="' + (c.conclusion === "success" ? "allow" : "deny") + '">' + esc(c.conclusion) + '</td><td>' + esc(c.detail || "") + '</td></tr>';
    }).join("") + '</table>' : '<div class="muted">Waiting for the ci workflow (sanity, e2e, qa-test-gap). Run node scripts/sync_pr.js to pull results from GitHub.</div>') +
    kv("Run", link(ci.run_url)) + kv("Triage", ci.triage ? esc(ci.triage) : ""));
  html += card("8 · Claude review", rv.status,
    kv("Verdict", esc(rv.verdict)) + kv("Reviewer", esc(rv.reviewer)) + kv("Comments", rv.comments) + kv("Summary", esc(rv.summary)) +
    (!rv.verdict ? '<div class="muted">The claude-code-review workflow posts a comment starting with "Verdict:". Advice for the human reviewer, never an approval.</div>' : ""));
  html += card("9 · Gate 1 (human approval)", g1.status,
    kv("Decision", esc(g1.decision)) + kv("By", esc(g1.by)) + kv("At", shortTime(g1.at)) +
    (!g1.decision ? '<div class="muted">A person approves the pull request on GitHub. The hooks deny git merge and gh pr merge to the agent, so this step cannot be skipped.</div>' : ""));
  html += card("10 · Merge", mg.status,
    kv("Decision", esc(mg.decision)) + kv("Merge commit", mg.merge_commit, true) + kv("Merged by", esc(mg.by)) + kv("At", shortTime(mg.at)));

  document.getElementById("cards").innerHTML = html;
  document.getElementById("run-id").textContent = state.run_id ? "· run " + state.run_id : "· no run yet";
}

function renderAudit(events) {
  var rows = events.slice(-AUDIT_ROWS).reverse();
  document.getElementById("audit-count").textContent = "· " + events.length + " events, newest first";
  if (!rows.length) {
    document.getElementById("audit").innerHTML = '<div class="empty">No audit events yet. Start a Claude Code session in this repo; every tool call lands here.</div>';
    return;
  }
  document.getElementById("audit").innerHTML = '<table><tr><th>Time</th><th>Event</th><th>Tool</th><th>Target</th><th>Decision</th><th>Reason / result</th></tr>' +
    rows.map(function (e) {
      var decision = e.decision || (e.event === "test_run" ? (e.passed === true ? "pass" : e.passed === false ? "fail" : "ran") : "");
      var cls = decision === "allow" || decision === "pass" ? "allow" : decision === "deny" || decision === "block" || decision === "fail" ? "deny" : "";
      var detail = e.reason || e.result_preview || e.summary || e.prompt || "";
      return '<tr><td class="time">' + shortTime(e.ts) + '</td><td>' + esc(e.event) + '</td><td>' + esc(e.tool || e.kind || "") + '</td>' +
        '<td class="mono">' + esc(e.target || e.command || "") + '</td><td class="' + cls + '">' + esc(decision) + '</td><td>' + esc(String(detail).slice(0, 140)) + '</td></tr>';
    }).join("") + '</table>';
}

function setLive(ok, text) {
  var dot = document.getElementById("live-dot");
  dot.style.background = ok ? "var(--ok)" : "var(--down)";
  document.getElementById("live-text").textContent = ok ? "Live" : "Offline";
  document.getElementById("synced").textContent = text;
}

function refresh() {
  var state = { stages: {} };
  var events = [];
  fetchText("pipeline/state.json").then(function (t) {
    try { state = JSON.parse(t); } catch (e) { state = { stages: {} }; }
  }, function () { /* no state file yet */ }).then(function () {
    return fetchText("audit/audit.jsonl").then(function (t) { events = parseJsonl(t); }, function () { /* no audit yet */ });
  }).then(function () {
    renderStrip(state);
    renderCards(state);
    renderAudit(events);
    var t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    setLive(true, "Synced " + t + (state.updated_at ? " · state " + shortTime(state.updated_at) : ""));
  }).catch(function (err) {
    setLive(false, "Could not read pipeline files: " + err.message);
  });
}

refresh();
setInterval(refresh, REFRESH_MS);
