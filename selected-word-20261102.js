/* Use the existing favorite report formatter for the selected bill report only. */
(function (W) {
  "use strict";
  if (W.selectedWordRelease === "20261102") return;
  if (typeof W.downloadCompactFavorites !== "function") throw new Error("Compact Word formatter unavailable");
  const previous = downloadItemsWordReport;
  downloadItemsWordReport = function (items, title, filename, filter = "", group = false) {
    if (/선택 법안 보고서$/.test(String(title)) && /_선택법안보고서\.docx?$/i.test(String(filename))) {
      return W.downloadCompactFavorites(items, title, filename, true);
    }
    return previous.apply(this, arguments);
  };
  W.selectedWordRelease = "20261102";
})(window.LegislationWordParts);
