// Beacon Site Health - zero-dependency lint check.
// Usage: node scripts/lint.js          (exit 0 when clean, 1 when warnings)
//
// Scans the app files a feature touches (root .js / .html and tests/) for a
// small, readable set of rules. This is deliberately simple: the point is a
// fast, deterministic warnings list that an agent can fix in one batch.
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var FILES = ["index.html", "data.js", "csv.js", "serve.js"]
  .filter(function (f) { return fs.existsSync(path.join(ROOT, f)); })
  .concat(fs.readdirSync(path.join(ROOT, "tests")).map(function (f) { return "tests/" + f; }));

var RULES = [
  { id: "eqeq", re: /[^=!<>]==[^=]|[^=!<>]!=[^=]/, msg: "loose equality (== or !=); use === / !==" },
  { id: "console-log", re: /console\.log\(/, msg: "console.log left in app code" },
  { id: "todo-comment", re: /\/\/\s*(TODO|FIXME|HACK)\b/i, msg: "unresolved TODO/FIXME comment" },
  { id: "debugger", re: /^\s*debugger\s*;?\s*$/, msg: "debugger statement left in" },
  { id: "alert", re: /\balert\(/, msg: "alert() left in app code" }
];

// Lines the linter must not flag (the linter's own doc examples).
function isLintException(line) {
  return line.indexOf("lint-ok") !== -1;
}

var warnings = [];
FILES.forEach(function (rel) {
  var full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return;
  var lines = fs.readFileSync(full, "utf8").split("\n");
  lines.forEach(function (line, i) {
    if (isLintException(line)) return;
    RULES.forEach(function (rule) {
      if (rule.id === "console-log" && rel.indexOf("tests/") === 0) return; // tests may log
      if (rule.re.test(line)) {
        warnings.push(rel + ":" + (i + 1) + "  [" + rule.id + "]  " + rule.msg + "\n      " + line.trim());
      }
    });
  });
});

if (warnings.length === 0) {
  console.log("lint: clean (0 warnings across " + FILES.length + " files)");
  process.exit(0);
}
console.log("lint: " + warnings.length + " warning" + (warnings.length === 1 ? "" : "s") + "\n");
warnings.forEach(function (w) { console.log("  " + w + "\n"); });
process.exit(1);
