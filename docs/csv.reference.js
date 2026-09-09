// Reference implementation of csv.js, the file Claude writes live in step 3
// of the workshop. Kept here as the fallback if a live run goes sideways:
// copy it to the repo root as csv.js.
//
// Exposes window.toCsv(stores) -> string. Plain ES5, no dependencies.
// Fields that contain a comma, a quote or a newline are quoted, and quotes
// inside them are doubled, which is what Excel expects.
(function () {
  var COLUMNS = ["id", "name", "region", "fillRate", "posStatus", "netStatus", "openTickets", "daysOfSupply"];

  function cell(value) {
    var s = value === undefined || value === null ? "" : String(value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(stores) {
    var lines = [COLUMNS.join(",")];
    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      lines.push(COLUMNS.map(function (c) { return cell(s[c]); }).join(","));
    }
    return lines.join("\n") + "\n";
  }

  window.toCsv = toCsv;
})();
