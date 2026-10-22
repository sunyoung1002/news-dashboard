/* Word export part 4/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup, textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects, compactRow, compactPages, compactDocx } = W;
  function compactZip(files, filename, returnBytes = false) {
    const encoder = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const crc = data => {
      let value = 0xffffffff;
      for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); }
      return (value ^ 0xffffffff) >>> 0;
    };
    files.forEach(file => {
      const name = encoder.encode(file.name), data = typeof file.content === "string" ? encoder.encode("\ufeff" + file.content) : file.content, checksum = crc(data);
      const local = new Uint8Array(30), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
      lv.setUint32(14, checksum, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
      chunks.push(local, name, data);
      const header = new Uint8Array(46), cv = new DataView(header.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
      cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      central.push(header, name); offset += local.length + name.length + data.length;
    });
    const size = central.reduce((n, bytes) => n + bytes.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    const bytes = [...chunks, ...central, end];
    if (returnBytes) {
      const packed = new Uint8Array(bytes.reduce((n, item) => n + item.length, 0));
      let position = 0; bytes.forEach(item => { packed.set(item, position); position += item.length; });
      return packed;
    }
    const type = /\.docx$/i.test(filename) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/zip";
    const url = URL.createObjectURL(new Blob(bytes, { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function downloadCompactFavorites(items, title, filename, groupByAgency) {
    const rows = items.map(item => window.MonthlyBillUI?.latestItem(itemKey(item)) || item);
    const sorted = groupByAgency ? [...rows].sort((a,b) => String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko") || String(a.title || "").localeCompare(String(b.title || ""), "ko")) : rows;
    let font = items.length >= 85 ? 7 : 7.5, pages = compactPages(sorted, groupByAgency, font);
    while (pages.length > 4 && items.length <= 110 && font > 7) { font -= .25; pages = compactPages(sorted, groupByAgency, font); }
    const name = filename.replace(/\.docx?$/i, "");
    compactZip(compactDocx(pages, title, rows.length, font, 1, 1), `${name}.docx`);
  }

  Object.assign(W, { compactZip, downloadCompactFavorites });
})(window.LegislationWordParts = window.LegislationWordParts || {});
