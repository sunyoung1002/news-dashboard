/* Selected bills use the same landscape five-column formatter as monthly Word. */
(function (W) {
  "use strict";
  if (W.selectedWordRelease === "20261111") return;
  const previous = downloadItemsWordReport;
  downloadItemsWordReport = function (items, title, filename, filter = "", group = false) {
    if (/선택 법안 보고서$/.test(String(title)) && /_선택법안보고서\.docx?$/i.test(String(filename))) {
      const rows = typeof W.uniqueFavoriteBills === "function" ? W.uniqueFavoriteBills(items) : items;
      return previous.call(this, rows, title, filename, filter, group);
    }
    return previous.apply(this, arguments);
  };
  W.selectedWordRelease = "20261111";
})(window.LegislationWordParts);
