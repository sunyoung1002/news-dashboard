/* Word export part 6/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup, textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects, compactRow, compactPages, compactDocx, compactZip, downloadCompactFavorites } = W;
  downloadComparisonWordReport = function () {
    const items = selectedComparisonItems();
    if (items.length < 2) {
      window.alert("비교표를 출력하려면 법안을 2개 이상 선택해 주세요.");
      return;
    }
    const common = commonBillKeywords(items);
    const comparisonRows = [
      ["법안 정보", item => billInfoMarkup(item)],
      ["소관기관·위원회", item => `${escapeHtml(item.agency || "-")}<br>${escapeHtml(item.committee || "-")}`],
      ["진행현황", item => progressMarkup(item)],
      ["기준일", item => escapeHtml(referenceDate(item))],
      ["주요 내용 요약", item => escapeHtml(summarizeForReport(item)).replace(/\n/g, "<br>")],
      ["차별화 핵심어", item => distinctiveKeywords(item, items).map(escapeHtml).join(", ") || "-"]
    ];
    const rows = comparisonRows.map(([label, renderCell]) =>
      `<tr><th>${label}</th>${items.map(item => `<td>${renderCell(item)}</td>`).join("")}</tr>`
    ).join("");
    const generatedAt = new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    const content = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><style>
        @page WordSection1 { size:841.9pt 595.3pt; mso-page-orientation:landscape; margin:28.35pt; }
        div.WordSection1 { page:WordSection1; }
        body { font-family:'Malgun Gothic',sans-serif; font-size:9pt; color:#172033; }
        h1 { text-align:center; font-size:18pt; margin:0 0 8pt; }
        .meta { text-align:center; color:#475569; margin:0 0 8pt; }
        .common { padding:7pt; margin-bottom:8pt; background:#eff6ff; border:.75pt solid #bfdbfe; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        th,td { border:.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:keep-all; }
        thead th { background:#dbeafe; text-align:center; } tbody th { width:11%; background:#f1f5f9; text-align:left; }
        .bill-title { font-weight:bold; } .bill-number,.bill-proposer { display:block; margin-top:4pt; color:#475569; font-size:8pt; }
        .word-progress { width:100%; border:0; border-collapse:separate; border-spacing:3pt 0; table-layout:fixed; }
        .word-progress td { border:0; text-align:center; }
        .word-progress .progress-bars td { height:4pt; padding:0; background:#e5edf5; font-size:1pt; line-height:1pt; }
        .word-progress .progress-bars td.past { background:#2878ee; }
        .word-progress .progress-bars td.current { background:#ed7800; }
        .word-progress .progress-labels td { padding:4pt 0 0; color:#9aafc5; font-size:6.5pt; white-space:nowrap; }
        .word-progress .progress-labels td.past,.word-progress .progress-labels td.current { color:#334155; font-weight:bold; }
      </style></head><body><div class="WordSection1">
        <h1>${formatMonth(state.month)} 유사·선택 법안 비교 보고서</h1>
        <p class="meta">비교 법안 ${items.length}건 · 작성일 ${escapeHtml(generatedAt)}</p>
        <div class="common"><strong>공통 핵심어:</strong> ${common.length ? common.map(escapeHtml).join(", ") : "뚜렷한 공통 핵심어 없음"}</div>
        <table><thead><tr><th>비교항목</th>${items.map((_, index) => `<th>법안 ${index + 1}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      </div></body></html>`;
    createWordDownload(content, `${state.month}_법안비교보고서.doc`);
  };

  document.addEventListener("click", event => {
    if (!event.target.closest("#downloadComparison")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadComparisonWordReport();
  }, true);
})(window.LegislationWordParts = window.LegislationWordParts || {});
