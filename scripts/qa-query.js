#!/usr/bin/env node
// Fixed queries for the qa agent when it runs as a Stop hook, where it has
// no interpreter. Usage: node scripts/qa-query.js <command> [arg]
//   status        git status --porcelain
//   diff          git diff HEAD, plus untracked app files in full
//   sites         window.STORES from data.js, as JSON
//   api           GET http://localhost:8000/api/stores (empty if not running)
//   csv [file]    toCsv over the sites; with a file, over the JSON array in
//                 that file (or "-" for stdin), so any case can be tried
//   bytes [file]  first 16 bytes of that CSV as hex (BOM checks)
//   tests         node --test tests/*.test.js
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var http = require("http");
var ROOT = path.join(__dirname, "..");
var cmd = process.argv[2] || "";
var arg = process.argv[3];

function loadSites() {
  global.window = {};
  require(path.join(ROOT, "data.js"));
  return global.window.STORES;
}
function loadCsv() {
  global.window = global.window || {};
  require(path.join(ROOT, "csv.js"));
  return global.window.toCsv;
}
function storesFrom(file) {
  if (!file) return loadSites();
  var text = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(ROOT, file), "utf8");
  var v = JSON.parse(text);
  if (!Array.isArray(v)) throw new Error("expected a JSON array of sites");
  return v;
}
function out(s) { process.stdout.write(String(s)); }

switch (cmd) {
  case "status":
    out(cp.spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout); break;
  case "diff": {
    out(cp.spawnSync("git", ["diff", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout);
    var st = cp.spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout || "";
    st.split("\n").filter(function (l) { return l.indexOf("??") === 0; }).forEach(function (l) {
      var f = l.slice(3).trim();
      if (/^(tests\/)?[^\/]+\.(js|html)$/.test(f) && fs.existsSync(path.join(ROOT, f)))
        out("\n=== untracked: " + f + " ===\n" + fs.readFileSync(path.join(ROOT, f), "utf8"));
    });
    break;
  }
  case "sites": out(JSON.stringify(loadSites(), null, 2)); break;
  case "api": {
    var req = http.get("http://localhost:8000/api/stores", function (res) {
      var b = ""; res.on("data", function (c) { b += c; }); res.on("end", function () { out(b); });
    });
    req.on("error", function () { out(""); });
    req.setTimeout(2000, function () { req.destroy(); out(""); });
    break;
  }
  case "csv": { var s = storesFrom(arg); var toCsv = loadCsv(); out(toCsv(s)); break; }
  case "bytes": {
    var s2 = storesFrom(arg); var t = loadCsv()(s2);
    out(Buffer.from(t, "utf8").slice(0, 16).toString("hex").replace(/(..)/g, "$1 ").trim() + "\n"); break;
  }
  case "tests": {
    var files = fs.readdirSync(path.join(ROOT, "tests")).filter(function (f) { return /\.test\.js$/.test(f); }).map(function (f) { return "tests/" + f; });
    var r = cp.spawnSync("node", ["--test"].concat(files), { cwd: ROOT, encoding: "utf8" });
    out(r.stdout + r.stderr); process.exit(r.status); break;
  }
  default:
    process.stderr.write("usage: node scripts/qa-query.js status|diff|sites|api|csv [file]|bytes [file]|tests\n");
    process.exit(1);
}
