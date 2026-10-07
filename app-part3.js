function downloadWordReport() {
  downloadItemsWordReport(
    filteredItems(),
    `${formatMonth(state.month)} 입법 진행현황 보고서`,
    `${state.month}_입법진행현황.doc`
  );
}

function downloadSelectedWordReport() {
  const items = selectedCollectionItems();
  downloadItemsWordReport(
    items,
    `${formatMonth(state.month)} 선택 법안 보고서`,
    `${state.month}_선택법안보고서.doc`,
    `보관함에서 선택한 법안 ${items.length.toLocaleString()}건`
  );
}

function downloadFavoriteWordReport() {
  const items = favoriteItems();
  downloadItemsWordReport(
    items,
    "주요법안현황",
    "주요법안현황.doc",
    `즐겨찾기에 등록한 법안 ${items.length.toLocaleString()}건 · 소관기관별 분류`,
    true
  );
}

function downloadFavoriteCategoryWordReport(categoryId) {
  const group = favoriteCategoryGroups().find(entry => entry.id === categoryId);
  if (!group || !group.items.length) {
    window.alert("이 분야에 Word 보고서로 출력할 법안이 없습니다.");
    return;
  }
  const safeFilename = group.label.replace(/[·/\\:*?"<>|]/g, "_");
  downloadItemsWordReport(
    group.items,
    `${group.label} 주요법안현황`,
    `${safeFilename}_주요법안현황.doc`,
    `즐겨찾기 분야: ${group.label} · ${group.items.length.toLocaleString()}건`,
    true
  );
}

function downloadFavoriteItemWordReport(itemId) {
  const item = state.data.find(entry => itemKey(entry) === itemId) || state.favoriteRows.get(itemId);
  if (!item) {
    window.alert("선택한 법안 정보를 찾지 못했습니다.");
    return;
  }
  const safeFilename = String(item.title || "법안")
    .replace(/[·/\\:*?"<>|]/g, "_")
    .slice(0, 70);
  downloadItemsWordReport(
    [item],
    `${item.title} 주요내용`,
    `${safeFilename}_보고서.doc`,
    `즐겨찾기 개별 법안 · 의안번호 ${displayBillNo(item) || "확인 중"}`
  );
}

function wordStageProgress(stage) {
  const current = STAGES.indexOf(stage);
  const bars = STAGES.map((label, index) => {
    const color = index === current ? "#f28c18" : index < current ? "#3175dc" : "#e4eaf1";
    return `<td width="20%" bgcolor="${color}" style="background:${color};height:4pt;font-size:1pt;line-height:4pt;border:1.5pt solid #ffffff;padding:0">&nbsp;</td>`;
  }).join("");
  const labels = STAGES.map((label, index) =>
    `<td width="20%" style="border:0;padding:3pt 1pt 0;text-align:center;color:${index <= current ? "#34465d" : "#9fb3c8"};font-size:7pt;white-space:nowrap">${escapeHtml(label)}</td>`
  ).join("");
  return `<table class="stage-progress" cellspacing="0" cellpadding="0" style="width:100%;border:0;table-layout:fixed"><tr>${bars}</tr><tr>${labels}</tr></table>`;
}

function downloadItemsWordReport(items, reportTitle, filename, customFilterLabel = "", groupByAgency = true) {
  if (!items.length) {
    window.alert("Word 보고서로 출력할 법안이 없습니다.");
    return;
  }

  const reportItems = groupByAgency ? [...items].sort((a, b) => {
    const agencyOrder = String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko");
    return agencyOrder || String(a.title || "").localeCompare(String(b.title || ""), "ko");
  }) : items;
  let previousAgency = "";
  let agencyNumber = 0;
  const rows = reportItems.map(item => {
    const agency = item.agency || "기타";
    if (agency !== previousAgency) agencyNumber = 0;
    agencyNumber += 1;
    const agencyRow = groupByAgency && agency !== previousAgency
      ? `<tr class="agency-group"><td colspan="5">${escapeHtml(agency)}</td></tr>`
      : "";
    previousAgency = agency;
    const summary = summarizeForComparison(item);
    return `${agencyRow}
      <tr>
        <td class="number" width="3.5%" style="width:3.5%">${agencyNumber}</td>
        <td width="16.5%" style="width:16.5%">
          <strong>${escapeHtml(item.title)}</strong><br>
          <span class="sub">의안번호 ${escapeHtml(displayBillNo(item) || "확인 중")}</span><br>
          <span class="sub">${escapeHtml(item.proposer || "발의자 확인 중")}</span>
        </td>
        <td width="12.5%" style="width:12.5%">
          ${escapeHtml(item.agency)}
          <br><span class="sub">${escapeHtml(item.committee)}</span>
        </td>
        <td width="16.5%" style="width:16.5%">
          ${wordStageProgress(item.stage)}
        </td>
        <td class="summary-cell" width="51%" style="width:51%">
          ${escapeHtml(summary)}
        </td>
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
  const content = `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(reportTitle)}</title>
      <style>
        @page WordSection1 {
          size: 841.9pt 595.3pt;
          mso-page-orientation: landscape;
          margin: 28.35pt 28.35pt 28.35pt 28.35pt;
        }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Malgun Gothic', sans-serif; font-size: 8.5pt; color: #172033; }
        h1 { margin: 0 0 8pt; text-align: center; font-size: 18pt; }
        .meta { margin: 0 0 10pt; text-align: center; color: #4b5563; font-size: 9pt; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th, td { border: 0.75pt solid #64748b; padding: 5pt; vertical-align: top; line-height: 1.45; word-break: keep-all; overflow-wrap: break-word; }
        th { background: #dbeafe; text-align: center; font-weight: bold; }
        .number { text-align: center; }
        .sub { color: #475569; font-size: 8pt; }
        table.stage-progress { width: 100%; border: 0; margin: 0 0 5pt; }
        table.stage-progress td { vertical-align: middle; }
        .summary-cell { line-height: 1.5; white-space: pre-line; }
        .agency-group td { padding: 5pt 7pt; background: #eff6ff; color: #163f70; font-size: 10pt; font-weight: bold; }
        a { color: #1d4ed8; text-decoration: underline; }
        .note { margin-top: 7pt; color: #64748b; font-size: 7.5pt; }
      </style>
    </head>
    <body><div class="WordSection1">
      <h1>${escapeHtml(reportTitle)}</h1>
      <p class="meta">조회조건: ${escapeHtml(filters)} · 총 ${items.length.toLocaleString()}건 · 작성일 ${escapeHtml(generatedAt)}</p>
      <table class="report-table" width="100%" style="width:100%;table-layout:fixed;mso-table-layout-alt:fixed">
        <colgroup>
          <col width="3.5%" style="width:3.5%"><col width="16.5%" style="width:16.5%"><col width="12.5%" style="width:12.5%"><col width="16.5%" style="width:16.5%"><col width="51%" style="width:51%">
        </colgroup>
        <thead><tr><th width="3.5%" style="width:3.5%">번호</th><th width="16.5%" style="width:16.5%">법안 정보</th><th width="12.5%" style="width:12.5%">소관 기관</th><th width="16.5%" style="width:16.5%">진행 현황</th><th width="51%" style="width:51%">주요내용 요약</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="note">※ 주요내용은 원문에서 개정 취지·문제점을 중심으로 약 5~6줄 분량의 완결된 문장으로 정리했습니다. 정확한 내용은 공식 원문을 확인해 주세요.</p>
    </div></body></html>`;
  createWordDownload(content, filename);
}

function downloadComparisonWordReport() {
  const items = selectedComparisonItems();
  if (items.length < 2) {
    window.alert("비교표를 출력하려면 법안을 2개 이상 선택해 주세요.");
    return;
  }
  const common = commonBillKeywords(items);
  const comparisonRows = [
    ["법안명", item => `<strong>${escapeHtml(item.title)}</strong>`],
    ["의안번호", item => escapeHtml(item.billNo)],
    ["대표발의자", item => escapeHtml(item.proposer)],
    ["소관기관·위원회", item => `${escapeHtml(item.agency)}<br>${escapeHtml(item.committee)}`],
    ["진행단계", item => wordStageProgress(item.stage)],
    ["최근 변동", item => escapeHtml(item.change)],
    ["주요 내용 요약", item => escapeHtml(summarizeForComparison(item)).replace(/\n/g, "<br>")],
    ["차별화 핵심어", item => distinctiveKeywords(item, items).map(escapeHtml).join(", ") || "-"]
  ];
  const rows = comparisonRows.map(([label, renderCell]) =>
    `<tr><th>${label}</th>${items.map(item => `<td>${renderCell(item)}</td>`).join("")}</tr>`
  ).join("");
  const generatedAt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const content = `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><style>
      @page WordSection1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 28.35pt; }
      div.WordSection1 { page: WordSection1; }
      body { font-family:'Malgun Gothic',sans-serif; font-size:9pt; color:#172033; }
      h1 { text-align:center; font-size:18pt; margin:0 0 8pt; }
      .meta { text-align:center; color:#475569; margin:0 0 8pt; }
      .common { padding:7pt; margin-bottom:8pt; background:#eff6ff; border:0.75pt solid #bfdbfe; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; }
      th,td { border:0.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:keep-all; }
      thead th { background:#dbeafe; text-align:center; }
      tbody th { width:11%; background:#f1f5f9; text-align:left; }
      table.stage-progress { width:100%;border:0;margin:0; }
      table.stage-progress td { vertical-align:middle; }
      a { color:#1d4ed8; }
    </style></head><body><div class="WordSection1">
      <h1>${formatMonth(state.month)} 유사·선택 법안 비교 보고서</h1>
      <p class="meta">비교 법안 ${items.length}건 · 작성일 ${escapeHtml(generatedAt)}</p>
      <div class="common"><strong>공통 핵심어:</strong> ${common.length ? common.map(escapeHtml).join(", ") : "뚜렷한 공통 핵심어 없음"}</div>
      <table><thead><tr><th>비교항목</th>${items.map((item, index) => `<th>법안 ${index + 1}<br>${escapeHtml(shortTitle(item.title, 30))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    </div></body></html>`;
  createWordDownload(content, `${state.month}_법안비교보고서.doc`);
}

function createWordDownload(content, filename) {
  const blob = new Blob(["\ufeff", content], { type: "application/msword" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  const objectUrl = anchor.href;
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    anchor.remove();
  }, 1500);
}

function summarizeForComparison(item) {
  let text = cleanBillSummary(item).replace(/의안 상세정보|인쇄/g, " ");

  [item.title, item.proposer, item.billNo].filter(Boolean).forEach(value => {
    text = text.split(String(value)).join(" ");
  });
  text = text
    .replace(/의안번호\s*\d+/g, " ")
    .replace(/\.{3,}|…+/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (isMissingBillSummary(text)) {
    return "주요내용 데이터가 없습니다.";
  }

  const sentences = splitReportSentences(text)
    .map(sentence => sentence.replace(/\s+/g, " ").trim())
    .filter(sentence => sentence.length >= 12 && /[.!?]$/.test(sentence));
  if (!sentences.length) return "공식 원문에서 완결된 주요 문장을 확인해 주세요.";

  const candidates = sentences.map((sentence, index) => ({ sentence, index }));
  const score = entry => {
    if (/^이에|^따라서|개정|신설|도입|하려는|하고자|강화|완화|개선/.test(entry.sentence)) return 3;
    if (/문제|지적|우려|어려|부담|피해|한계|불합리|그러나|그런데/.test(entry.sentence)) return 2;
    return 1;
  };
  const prioritized = [...candidates].sort((a, b) =>
    score(b) - score(a) || a.sentence.length - b.sentence.length || a.index - b.index
  );
  const selected = [];
  let totalLength = 0;

  prioritized.forEach(entry => {
    if (selected.length >= COMPARISON_SUMMARY_MAX_POINTS) return;
    const addedLength = entry.sentence.length + (selected.length ? 3 : 0);
    if (!selected.length || totalLength + addedLength <= COMPARISON_SUMMARY_MAX_CHARS) {
      selected.push(entry);
      totalLength += addedLength;
    }
  });

  return selected
    .sort((a, b) => a.index - b.index)
    .map(entry => `• ${entry.sentence}`)
    .join("\n");
}

function summarizeForReport(item) {
  let text = String(item.summary || "")
    .replace(/창닫기|의안 상세정보|인쇄/g, " ")
    .replace(/\[\s*\d+\s*\]/g, " ")
    .replace(/제안이유\s*및\s*주요내용|제안이유|주요내용/g, " ");

  [item.title, item.proposer, item.billNo].filter(Boolean).forEach(value => {
    text = text.split(String(value)).join(" ");
  });
  text = text.replace(/의안번호\s*\d+/g, " ").replace(/\s+/g, " ").trim();

  if (!text || text.includes("확인 중입니다")) {
    return "공식 제안이유 및 주요내용을 확인 중입니다.";
  }

  let sentences = splitReportSentences(text)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 8);

  // 수집 원문이 글자 수 제한 때문에 문장 중간에서 잘린 짧은 꼬리는 제외합니다.
  if (sentences.length > 1) {
    const last = sentences[sentences.length - 1];
    if (!/[.!?]$/.test(last) && last.length < 45) sentences.pop();
  }

  // 마침표 없이 이어진 긴 원문도 보고서에서 읽기 좋게 의미 단위로 나눕니다.
  if (sentences.length < 2 && text.length > 90) {
    sentences = text.split(/(?=그런데|그러나|또한|특히|한편|이에|따라서)/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length >= 8);
  }

  const candidates = sentences.map((sentence, index) => ({ sentence, index }));
  const selected = [];
  const add = entry => {
    if (entry && !selected.some(current => current.index === entry.index)) selected.push(entry);
  };
  add(candidates[0]);
  add(candidates.find(entry => /문제|지적|우려|어려|부담|피해|한계|불합리/.test(entry.sentence)));
  add([...candidates].reverse().find(entry => /이에|따라서|개정|신설|도입|하도록|하려는|하고자|강화|완화|개선/.test(entry.sentence)));
  candidates.forEach(add);

  const points = selected.slice(0, REPORT_SUMMARY_MAX_POINTS)
    .sort((a, b) => a.index - b.index)
    .map(entry => compactReportPoint(entry.sentence, 54));
  let summary = points.map(point => `• ${point}`).join("\n");
  if (summary.length > REPORT_SUMMARY_MAX_CHARS) {
    summary = `${summary.slice(0, REPORT_SUMMARY_MAX_CHARS - 1).replace(/[\s,.;:]+$/, "")}…`;
  }
  return summary;
}

function compactReportPoint(sentence, maxLength) {
  const cleaned = sentence.replace(/\s+/g, " ").replace(/^[,.;:\s]+|[,;:\s]+$/g, "").trim();
  if (cleaned.length <= maxLength) return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  return `${cleaned.slice(0, maxLength - 1).replace(/[\s,.;:]+$/, "")}…`;
}

function splitReportSentences(text) {
  const parts = text.split(/([.!?]+)\s+/);
  const sentences = [];
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = `${parts[index] || ""}${parts[index + 1] || ""}`.trim();
    if (sentence) sentences.push(sentence);
  }
  return sentences.length ? sentences : [text];
}

function formatMonth(value) {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

loadData().catch(error => {
  $("#billList").innerHTML = `<div class="empty">${escapeHtml(error.message)}<br>로컬 파일을 직접 열었다면 웹서버로 실행해 주세요.</div>`;
});
