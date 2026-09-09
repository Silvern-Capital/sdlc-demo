// Beacon Site Health — CSV export
// window.toCsv(stores) returns the CSV text for the header's "Export CSV" button.
// Reads the store objects only; never mutates them.
window.toCsv = function (stores) {
  var columns = ["id", "name", "region", "fillRate", "posStatus", "netStatus", "openTickets", "daysOfSupply"];

  function escapeField(value) {
    var text = value === null || value === undefined ? "" : String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  var lines = [columns.join(",")];
  (stores || []).forEach(function (s) {
    lines.push(columns.map(function (col) { return escapeField(s[col]); }).join(","));
  });
  return lines.join("\r\n") + "\r\n";
};
