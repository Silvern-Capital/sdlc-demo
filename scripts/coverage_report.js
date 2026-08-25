// Beacon - code coverage via Node's built-in V8 coverage. No dependencies.
//
// Usage: node scripts/coverage_report.js
//
// Runs the loadable code paths (data load, migration validator, the serve.js
// API surface) under NODE_V8_COVERAGE, then reports per-file byte coverage
// for the repo's own files and writes pipeline/coverage.json for the
// pipeline page and CI status.
var fs = require("fs");
var os = require("os");
var path = require("path");
var http = require("http");
var spawnSync = require("child_process").spawnSync;
var spawn = require("child_process").spawn;

var ROOT = path.join(__dirname, "..");
var COVDIR = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-cov-"));
var PORT = 8765;

function runNode(args, env) {
  var r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: Object.assign({}, process.env, { NODE_V8_COVERAGE: COVDIR }, env || {}),
    encoding: "utf8", timeout: 30000
  });
  return r.status;
}

function get(p, cb) {
  http.get({ host: "127.0.0.1", port: PORT, path: p }, function (res) {
    res.resume(); res.on("end", function () { cb(null, res.statusCode); });
  }).on("error", cb);
}

// 1. data load + migration validator (validator exits 1 on seeded drift; fine)
runNode(["-e", "global.window={};require('./data.js');if(!window.STORES.length)process.exit(1)"]);
runNode([path.join("qa", "check_migration.js")]);

// 2. serve.js API surface: boot, hit the three routes, shut down
// -e wrapper: SIGINT's default handler skips the V8 coverage flush, so
// convert it to a clean process.exit, which flushes.
var server = spawn(process.execPath, ["-e", "process.on('SIGINT',function(){process.exit(0)});require(process.cwd()+'/serve.js')"], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { NODE_V8_COVERAGE: COVDIR, PORT: String(PORT) }),
  stdio: "ignore"
});
setTimeout(function () {
  get("/api/stores", function () {
    get("/api/stores/1305", function () {
      get("/api/stores/none", function () {
        get("/index.html", function () {
          server.kill("SIGINT"); // graceful: lets node flush coverage
          server.on("exit", function () { setTimeout(report, 200); });
        });
      });
    });
  });
}, 400);

function paint(fileLen, functions) {
  // Byte map painted outer-to-inner; nested ranges override (V8 order).
  var covered = new Uint8Array(fileLen);
  var ranges = [];
  functions.forEach(function (fn) {
    fn.ranges.forEach(function (r) { ranges.push(r); });
  });
  ranges.sort(function (a, b) {
    return a.startOffset - b.startOffset || b.endOffset - a.endOffset;
  });
  ranges.forEach(function (r) {
    var v = r.count > 0 ? 1 : 0;
    for (var i = r.startOffset; i < Math.min(r.endOffset, fileLen); i++) covered[i] = v;
  });
  var hit = 0;
  for (var i = 0; i < fileLen; i++) if (covered[i]) hit++;
  return hit;
}

function report() {
  var WANT = ["data.js", "serve.js", path.join("qa", "check_migration.js")];
  var best = {}; // rel -> {hit, len}  (merge across processes: best hit wins per file)
  fs.readdirSync(COVDIR).forEach(function (f) {
    var doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(COVDIR, f), "utf8")); } catch (e) { return; }
    (doc.result || []).forEach(function (entry) {
      if (entry.url.indexOf("file://") !== 0) return;
      var abs = entry.url.slice("file://".length);
      var rel = path.relative(ROOT, abs);
      if (WANT.indexOf(rel) === -1) return;
      var len = fs.statSync(abs).size;
      var hit = paint(len, entry.functions || []);
      if (!best[rel] || hit > best[rel].hit) best[rel] = { hit: hit, len: len };
    });
  });
  var rows = WANT.filter(function (r) { return best[r]; }).map(function (r) {
    var pct = Math.round((best[r].hit / best[r].len) * 1000) / 10;
    return { file: r, coveredBytes: best[r].hit, totalBytes: best[r].len, pct: pct };
  });
  var out = { generated: new Date().toISOString(), tool: "node NODE_V8_COVERAGE", files: rows };
  fs.writeFileSync(path.join(ROOT, "pipeline", "coverage.json"), JSON.stringify(out, null, 2));
  console.log("coverage (V8 byte coverage):");
  rows.forEach(function (r) {
    console.log("  " + r.file.padEnd(28) + String(r.pct).padStart(5) + "%  (" + r.coveredBytes + "/" + r.totalBytes + " bytes)");
  });
  if (rows.length === 0) { console.log("  no coverage captured"); process.exit(1); }
}
