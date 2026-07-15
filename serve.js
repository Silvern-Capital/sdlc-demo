// Beacon Site Health — zero-dependency dev server + stores API
// Usage: node serve.js  →  http://localhost:8000
// Serves the static dashboard and exposes:
//   GET /api/stores      → full window.STORES array from data.js
//   GET /api/stores/:id  → single store, 404 if unknown
var http = require("http");
var fs = require("fs");
var path = require("path");

global.window = {};
require("./data.js");
var STORES = global.window.STORES;

var PORT = process.env.PORT || 8000;
var ROOT = __dirname;

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

var server = http.createServer(function (req, res) {
  var url = req.url.split("?")[0];

  if (url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/api/stores") {
    sendJson(res, 200, STORES);
    return;
  }

  var m = url.match(/^\/api\/stores\/([^\/]+)$/);
  if (m) {
    var id = decodeURIComponent(m[1]);
    var store = STORES.filter(function (s) { return s.id === id; })[0];
    if (store) {
      sendJson(res, 200, store);
    } else {
      sendJson(res, 404, { error: "store not found", id: id });
    }
    return;
  }

  var file = url === "/" ? "/index.html" : url;
  var full = path.join(ROOT, path.normalize(file));
  if (full.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(full, function (err, buf) {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(buf);
  });
});

server.listen(PORT, function () {
  console.log("Beacon serving http://localhost:" + PORT + " (API: /api/stores)");
});
