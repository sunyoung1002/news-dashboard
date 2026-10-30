/* Small loader. Upload word-format-part1.js through part6.js first. */
(function () {
  "use strict";
  const release = "20261030-duplicate-audit";
  const base = document.currentScript?.src || new URL("word-format-fix.js", document.baseURI).href;
  const buttons = "#downloadReport,#downloadSelected,#downloadFavorites,#downloadFavoriteCategoryDialog,#downloadFavoriteDetail,#downloadComparison";
  const queued = new WeakSet();
  let loaded = false;
  let failed = false;
  let missing = "";
  function loadFile(name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const url = new URL(name, base);
      url.searchParams.set("v", release);
      script.src = url.href;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => { missing = name; reject(new Error(name)); };
      document.head.appendChild(script);
    });
  }
  const ready = (async () => {
    try {
      for (let number = 1; number <= 6; number++) await loadFile(`word-format-part${number}.js`);
      for (let number = 1; number <= 2; number++) await loadFile(`word-reviewed-20261029-${number}.js`);
      await loadFile("word-export-20261029.js");
      await loadFile("bill-word-links-20261028c.js");
      await loadFile("bill-card-summary-20261028c.js");
      if ((window.LegislationWordParts?.stableRelease !== "20261028c" || window.LegislationWordParts?.reviewedEffectsRelease !== "20261029") || !window.LegislationCardSummary) throw new Error("Word module");
      await loadFile("word-dedup-20261029.js");
      if (window.LegislationWordParts?.dedupRelease !== "20261029") throw new Error("Word dedup");
      await loadFile("favorite-duplicate-audit.js");
      loaded = true;
    } catch (_) { failed = true; }
  })();
  document.addEventListener("click", event => {
    const button = event.target.closest?.(buttons);
    if (!button || loaded) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (queued.has(button)) return;
    queued.add(button);
    ready.then(() => {
      queued.delete(button);
      if (failed) window.alert(`Word 출력 파일을 불러오지 못했습니다. ${missing} 파일을 같은 폴더에 올린 뒤 새로고침해 주세요.`);
      else button.click();
    });
  }, true);
})();
