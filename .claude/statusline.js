// Status line: runs on your machine after every message and prints one line
// at the bottom of the terminal. Its output never enters the context window,
// so it costs zero tokens. The dollar figure is list-price math computed
// locally; it is an estimate, not your bill.
var d;
try {
  d = JSON.parse(require("fs").readFileSync(0, "utf8") || "{}");
} catch (e) {
  d = {};
}
var cost = d.cost || {};
var ctx = d.context_window || {};
var pct = ctx.used_percentage == null ? "-" : Math.round(ctx.used_percentage);
process.stdout.write(
  ((d.model && d.model.display_name) || "Claude") +
  " · $" + (cost.total_cost_usd || 0).toFixed(2) +
  " · " + pct + "% context" +
  " · +" + (cost.total_lines_added || 0) +
  " / -" + (cost.total_lines_removed || 0) + " lines"
);
