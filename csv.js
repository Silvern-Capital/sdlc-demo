// Beacon Site Health — CSV export
// window.toCsv(stores) returns the text the "Export CSV" button downloads
// as beacon-sites.csv. Plain ES5, no dependencies. Reads the store objects,
// never mutates them.
(function () {
  var COLUMNS = ["id", "name", "region", "fillRate",
    "posStatus", "netStatus", "openTickets", "daysOfSupply"];

  // RFC 4180: quote a field when it holds a comma, a double quote or a
  // line break; double any embedded quotes.
  function csvField(value) {
    var s = (value === null || value === undefined) ? "" : String(value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvRow(values) {
    return values.map(csvField).join(",");
  }

  window.toCsv = function (stores) {
    var rows = [csvRow(COLUMNS)];
    (stores || []).forEach(function (s) {
      rows.push(csvRow(COLUMNS.map(function (col) { return s[col]; })));
    });
    return rows.join("\r\n") + "\r\n";
  };
})();
