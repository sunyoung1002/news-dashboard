/* Small loader. Upload word-format-part1.js through part6.js first. */
(function () {
  "use strict";
  const release = "20261027-word8-standard";
  const base = document.currentScript?.src || new URL("word-format-fix.js", document.baseURI).href;
  const buttons = "#downloadReport,#downloadSelected,#downloadFavorites,#downloadFavoriteCategoryDialog,#downloadFavoriteDetail,#downloadComparison";
  const queued = new WeakSet();
  let loaded = false;
  let failed = false;
  let missing = "";
  function loadPart(number) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const name = `word-format-part${number}.js`;
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
      for (let number = 1; number <= 6; number++) await loadPart(number);
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
