/* Word table format: title / bill number / proposer on separate lines. */
(function () {
  "use strict";

  function billInfoMarkup(item) {
    return `<div class="bill-title">${escapeHtml(item.title || "법안명 확인 중")}</div>
      <div class="bill-number">${escapeHtml(item.billNo || "의안번호 확인 중")}</div>
      <div class="bill-proposer">${escapeHtml(item.proposer || "발의자 확인 중")}</div>`;
  }

  function referenceDate(item) {
    return item.stageDate || item.dailyChangedDate || item.changedDate || "-";
  }

  function favoriteSummary(item) {
    let text = String(item.summary || "")
      .replace(/창닫기\s*(?:\[\s*\d+\s*\])?|의안 상세정보|인쇄/g, " ")
      .replace(/\[\s*\d{5,}\s*\]/g, " ")
      .replace(/제안이유\s*및\s*주요내용|제안이유|주요내용/g, " ")
      .replace(/\.{3,}|…+/g, " ");
    [item.title, item.proposer, item.billNo].filter(Boolean).forEach(value => {
      text = text.split(String(value)).join(" ");
    });
    text = text.replace(/의안번호\s*\d+/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.includes("확인 중입니다")) return "공식 제안이유 및 주요내용을 확인 중입니다.";

    const sentences = text.split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.replace(/^(이에|그러나|따라서|또한)\s*[,，]?\s*/, "").trim())
      .filter(sentence => sentence.length >= 12 && /[.!?]$/.test(sentence));
    if (!sentences.length) return summarizeForReport(item);
    const scored = sentences.map((sentence, index) => ({ sentence, index, score:
      (sentence.match(/개정|신설|도입|확대|강화|완화|개선|보호|지원|의무|금지|부과|마련/g) || []).length * 4
      + (/문제|지적|우려|어려|부담|피해|한계|필요/.test(sentence) ? 2 : 0)
      + (index === 0 ? 1 : 0) }));
    const selected = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3)
      .sort((a, b) => a.index - b.index).map(entry => `• ${entry.sentence}`);
    return selected.join("\n");
  }

  function stageDateMarkup(item, favoriteReport) {
    if (!favoriteReport) return `기준일 ${escapeHtml(referenceDate(item))}`;
    const stage = escapeHtml(item.stage || "진행단계");
    const date = escapeHtml(referenceDate(item));
    const present = item.committeePresentDate ? ` · 상정일: ${escapeHtml(item.committeePresentDate)}` : "";
    if (item.stage === "소관위") return `${stage} · ${date}${present}`;
    const committeeDate = item.committeeDate || item.committeePresentDate;
    const committeeLine = committeeDate ? `<br>소관위 · ${escapeHtml(committeeDate)}${present}` : "";
    return `${stage} · ${date}${committeeLine}`;
  }

  function progressMarkup(item) {
    const stages = ["접수", "소관위", "법사위", "본회의", "공포·시행"];
    const current = Math.max(0, stages.indexOf(item.stage));
    const stateClass = index => index < current ? "past" : index === current ? "current" : "waiting";
    return `<table class="word-progress" role="presentation">
      <tr class="progress-bars">${stages.map((_, index) =>
        `<td class="${stateClass(index)}">&nbsp;</td>`).join("")}</tr>
      <tr class="progress-labels">${stages.map((stage, index) =>
        `<td class="${stateClass(index)}">${stage}</td>`).join("")}</tr>
    </table>`;
  }

  downloadItemsWordReport = function (items, reportTitle, filename, customFilterLabel = "", groupByAgency = false) {
    if (!items.length) {
      window.alert("Word 보고서로 출력할 법안이 없습니다.");
      return;
    }

    const favoriteReport = /주요법안현황|즐겨찾기/.test(`${reportTitle} ${customFilterLabel}`);
    const reportItems = groupByAgency ? [...items].sort((a, b) => {
      const agencyOrder = String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko");
      return agencyOrder || String(a.title || "").localeCompare(String(b.title || ""), "ko");
    }) : items;
    let previousAgency = "";
    const rows = reportItems.map((item, index) => {
      const agency = item.agency || "기타";
      const agencyRow = groupByAgency && agency !== previousAgency
        ? `<tr class="agency-group"><td colspan="5">${escapeHtml(agency)}</td></tr>`
        : "";
      previousAgency = agency;
      return `${agencyRow}<tr>
        <td class="number">${index + 1}</td>
        <td class="bill-info">${billInfoMarkup(item)}</td>
        <td>${escapeHtml(agency)}<div class="sub">${escapeHtml(item.committee || "위원회 확인 중")}</div></td>
        <td>${progressMarkup(item)}
          <div class="reference-date">${stageDateMarkup(item, favoriteReport)}</div></td>
        <td class="summary-cell">${escapeHtml(favoriteReport ? favoriteSummary(item) : summarizeForReport(item))}</td>
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
        @page WordSection1 { size:841.9pt 595.3pt; mso-page-orientation:landscape; margin:28.35pt; }
        div.WordSection1 { page:WordSection1; }
        body { font-family:'Malgun Gothic',sans-serif; font-size:8.5pt; color:#172033; }
        h1 { margin:0 0 8pt; text-align:center; font-size:18pt; }
        .meta { margin:0 0 10pt; text-align:center; color:#4b5563; font-size:9pt; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        thead { display:table-header-group; } tr { page-break-inside:avoid; }
        th,td { border:.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:keep-all; overflow-wrap:break-word; }
        th { background:#dbeafe; text-align:center; font-weight:bold; }
        .number { text-align:center; }
        .bill-title { font-weight:bold; color:#172033; }
        .bill-number,.bill-proposer,.sub,.reference-date { display:block; margin-top:4pt; color:#475569; font-size:8pt; }
        .summary-cell { line-height:1.5; white-space:pre-line; }
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
        <table><colgroup><col style="width:3.5%"><col style="width:18.5%"><col style="width:13.5%"><col style="width:18%"><col style="width:46.5%"></colgroup>
          <thead><tr><th>번호</th><th>법안 정보</th><th>소관 기관</th><th>진행 현황</th><th>주요내용 요약</th></tr></thead>
          <tbody>${rows}</tbody></table>
        <p class="note">※ 주요내용은 개정 취지와 핵심 내용을 중심으로 완결된 문장으로 정리했습니다.</p>
      </div></body></html>`;
    createWordDownload(content, filename);
  };

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
})();
