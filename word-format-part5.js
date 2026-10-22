/* Word export part 5/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup, textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects, compactRow, compactPages, compactDocx, compactZip, downloadCompactFavorites } = W;
  downloadItemsWordReport = function (items, reportTitle, filename, customFilterLabel = "", groupByAgency = false) {
    if (!items.length) {
      window.alert("Word 보고서로 출력할 법안이 없습니다.");
      return;
    }

    const favoriteReport = /주요법안현황|즐겨찾기/.test(`${reportTitle} ${customFilterLabel}`);
    if (favoriteReport) return downloadCompactFavorites(items, reportTitle, filename, groupByAgency);
    const reportItems = groupByAgency ? [...items].sort((a, b) => {
      const agencyOrder = String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko");
      return agencyOrder || String(a.title || "").localeCompare(String(b.title || ""), "ko");
    }) : items;
    let previousAgency = "";
    let agencyNumber = 0;
    const columnCount = favoriteReport ? 6 : 5;
    const rows = reportItems.map((item, index) => {
      const agency = item.agency || "기타";
      const agencyRow = groupByAgency && agency !== previousAgency
        ? `<tr class="agency-group"><td colspan="${columnCount}">${escapeHtml(agency)}</td></tr>`
        : "";
      if (agency !== previousAgency) agencyNumber = 0;
      agencyNumber += 1;
      previousAgency = agency;
      return `${agencyRow}<tr>
        <td class="number">${groupByAgency ? agencyNumber : index + 1}</td>
        <td class="bill-info" ${favoriteReport ? 'width="22%"' : ""}>${billInfoMarkup(item)}</td>
        <td ${favoriteReport ? 'width="12%"' : ""}>${escapeHtml(agency)}<div class="sub">${escapeHtml(item.committee || "위원회 확인 중")}</div></td>
        <td ${favoriteReport ? 'width="21%"' : ""}>${progressMarkup(item)}
          <div class="reference-date">${stageDateMarkup(item, favoriteReport)}</div></td>
        <td class="summary-cell" ${favoriteReport ? 'width="22%"' : ""}>${escapeHtml(favoriteReport ? favoriteSummary(item) : summarizeForReport(item))}${favoriteReport ? `<div class="sub">핵심어: ${escapeHtml(coreKeywords(item).join(" · ") || "공식 주요내용 확인 중")}</div>` : ""}</td>
        ${favoriteReport ? `<td class="effects-cell" width="18%">${effectsMarkup(item)}</td>` : ""}
      </tr>`;
    }).join("");

    const filters = customFilterLabel || [
      state.agency && `소관기관: ${state.agency}`,
      state.stage && `진행단계: ${state.stage}`,
      state.query && `검색어: ${state.query}`,
      state.changedOnly && "이번 달 변동만",
      state.selectedOnly && "선택 항목만",
      state.favoriteOnly && "즐겨찾기만"
    ].filter(Boolean).join(" / ") || "전체 조회";
    const generatedAt = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const content = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title><style>
        @page WordSection1 { ${favoriteReport ? "size:595.3pt 841.9pt; mso-page-orientation:portrait;" : "size:841.9pt 595.3pt; mso-page-orientation:landscape;"} margin:28.35pt; }
        div.WordSection1 { page:WordSection1; }
        body { font-family:'Malgun Gothic',sans-serif; font-size:8.5pt; color:#172033; }
        h1 { margin:0 0 8pt; text-align:center; font-size:18pt; }
        .meta { margin:0 0 10pt; text-align:center; color:#4b5563; font-size:9pt; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        thead { display:table-header-group; } tr { page-break-inside:avoid; }
        th,td { border:.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:${favoriteReport ? "break-all" : "keep-all"}; overflow-wrap:break-word; }
        th { background:#dbeafe; text-align:center; font-weight:bold; }
        .number { text-align:center; }
        .bill-title { font-weight:bold; color:#172033; }
        .bill-number,.bill-proposer,.sub,.reference-date { display:block; margin-top:4pt; color:#475569; font-size:8pt; }
        .summary-cell { line-height:1.5; white-space:pre-line; }
        .portrait-progress { font-size:8pt; line-height:1.5; }
        .effects-cell { font-size:8pt; }
        .word-progress { width:100%; border:0; border-collapse:separate; border-spacing:3pt 0; table-layout:fixed; }
        .word-progress td { border:0; text-align:center; }
        .word-progress .progress-bars td { height:4pt; padding:0; background:#e5edf5; font-size:1pt; line-height:1pt; }
        .word-progress .progress-bars td.past { background:#2878ee; }
        .word-progress .progress-bars td.current { background:#ed7800; }
        .word-progress .progress-labels td { padding:4pt 0 0; color:#9aafc5; font-size:6.5pt; white-space:nowrap; }
        .word-progress .progress-labels td.past,.word-progress .progress-labels td.current { color:#334155; font-weight:bold; }
        .agency-group td { padding:5pt 7pt; background:#eff6ff; color:#163f70; font-size:10pt; font-weight:bold; }
        .note { margin-top:7pt; color:#64748b; font-size:7.5pt; }
      </style></head><body><div class="WordSection1">
        <h1>${escapeHtml(reportTitle)}</h1>
        <p class="meta">조회조건: ${escapeHtml(filters)} · 총 ${items.length.toLocaleString()}건 · 작성일 ${escapeHtml(generatedAt)}</p>
        <table ${favoriteReport ? 'border="1" cellspacing="0" cellpadding="5" width="100%"' : ""}>${favoriteReport ? `<colgroup><col style="width:5%"><col style="width:22%"><col style="width:12%"><col style="width:21%"><col style="width:22%"><col style="width:18%"></colgroup>` : `<colgroup><col style="width:3.5%"><col style="width:18.5%"><col style="width:13.5%"><col style="width:18%"><col style="width:46.5%"></colgroup>`}
          <thead><tr><th>번호</th><th>${favoriteReport ? "법안정보" : "법안 정보"}</th><th>${favoriteReport ? "소관기관" : "소관 기관"}</th><th>${favoriteReport ? "진행현황" : "진행 현황"}</th><th>${favoriteReport ? "주요내용" : "주요내용 요약"}</th>${favoriteReport ? "<th>기타 영향 및 효과</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody></table>
        <p class="note">${favoriteReport ? "※ 주요내용은 한 문장으로 요약했습니다. 영향·효과는 주요내용에 근거한 예상이며 공식 영향평가가 아닙니다." : "※ 주요내용은 개정 취지와 핵심 내용을 중심으로 완결된 문장으로 정리했습니다."}</p>
      </div></body></html>`;
    createWordDownload(content, filename);
  };

})(window.LegislationWordParts = window.LegislationWordParts || {});
