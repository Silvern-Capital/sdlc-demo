// Beacon Site Health — CSV export
// window.toCsv(stores) returns the CSV text for the Export CSV button.
window.toCsv = function (stores) {
  var columns = [
    "id", "name", "region", "fillRate",
    "posStatus", "netStatus", "openTickets", "daysOfSupply",
    "avgRunRate7d"
  ];

  function escapeField(value) {
    var text = value === undefined || value === null ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function avgRunRate7d(store) {
    var runRate7d = store.runRate7d;
    if (!runRate7d || !runRate7d.length) {
      return "";
    }
    var sum = 0;
    for (var i = 0; i < runRate7d.length; i++) {
      sum += runRate7d[i];
    }
    return sum / runRate7d.length;
  }

  var lines = [columns.join(",")];
  stores.forEach(function (store) {
    lines.push(columns.map(function (col) {
      if (col === "avgRunRate7d") {
        return escapeField(avgRunRate7d(store));
      }
      return escapeField(store[col]);
    }).join(","));
  });
  return lines.join("\n") + "\n";
};
