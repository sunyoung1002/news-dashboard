const STAGES = ["접수", "소관위", "법사위", "본회의", "공포·시행"];
const REPORT_SUMMARY_MAX_POINTS = 3;
const REPORT_SUMMARY_MAX_CHARS = 180;

const state = {
  data: [],
  month: "2026-09",
  stage: "",
  agency: "",
  query: "",
  changedOnly: false,
  sort: "changed"
};

const $ = (selector) => document.querySelector(selector);

async function loadData() {
  const response = await fetch("sample-bills.json", { cache: "no-store" });
  if (!response.ok) throw new Error("표시 데이터를 불러오지 못했습니다.");
  const payload = await response.json();
  state.data = payload.items;
  $("#updatedAt").textContent = `기준일 ${payload.updatedAt}`;
  buildControls();
  bindEvents();
  render();
}

function buildControls() {
  const months = [...new Set(state.data.map(item => item.month))].sort().reverse();
  $("#monthSelect").innerHTML = months.map(month => `<option value="${month}">${formatMonth(month)}</option>`).join("");
  state.month = months[0];

  const agencies = [...new Set(state.data.map(item => item.agency))].sort();
  $("#agencyFilter").insertAdjacentHTML("beforeend", agencies.map(agency => `<option value="${agency}">${agency}</option>`).join(""));

  $("#stageFilters").innerHTML = [`<button class="chip active" data-stage="">전체</button>`]
    .concat(STAGES.map(stage => `<button class="chip" data-stage="${stage}">${stage}</button>`)).join("");
}

function bindEvents() {
  $("#monthSelect").addEventListener("change", event => { state.month = event.target.value; render(); });
  $("#agencyFilter").addEventListener("change", event => { state.agency = event.target.value; render(); });
  $("#searchInput").addEventListener("input", event => { state.query = event.target.value.trim().toLowerCase(); render(); });
  $("#changedOnly").addEventListener("change", event => { state.changedOnly = event.target.checked; render(); });
  $("#sortSelect").addEventListener("change", event => { state.sort = event.target.value; render(); });
  $("#stageFilters").addEventListener("click", event => {
    const button = event.target.closest("button[data-stage]");
    if (!button) return;
    state.stage = button.dataset.stage;
    document.querySelectorAll("#stageFilters .chip").forEach(chip => chip.classList.toggle("active", chip === button));
    render();
  });
  $("#resetFilters").addEventListener("click", () => {
    state.stage = ""; state.agency = ""; state.query = ""; state.changedOnly = false; state.sort = "changed";
    $("#agencyFilter").value = ""; $("#searchInput").value = ""; $("#changedOnly").checked = false; $("#sortSelect").value = "changed";
    document.querySelectorAll("#stageFilters .chip").forEach(chip => chip.classList.toggle("active", chip.dataset.stage === ""));
    render();
  });
  $("#downloadReport").addEventListener("click", downloadWordReport);
}

function filteredItems() {
  const stageIndex = stage => STAGES.indexOf(stage);
  const result = state.data.filter(item => {
    const haystack = `${item.title} ${item.billNo} ${item.agency} ${item.committee} ${item.summary}`.toLowerCase();
    return item.month === state.month && (!state.agency || item.agency === state.agency) &&
      (!state.stage || item.stage === state.stage) && (!state.query || haystack.includes(state.query)) &&
      (!state.changedOnly || item.changed);
  });
  return result.sort((a, b) => {
    if (state.sort === "title") return a.title.localeCompare(b.title, "ko");
    if (state.sort === "stage") return stageIndex(b.stage) - stageIndex(a.stage);
    return b.changedDate.localeCompare(a.changedDate);
  });
}

function render() {
  const monthItems = state.data.filter(item => item.month === state.month);
  const list = filteredItems();
  $("#selectedMonthLabel").textContent = formatMonth(state.month);
  $("#statTotal").textContent = monthItems.length.toLocaleString();
  $("#statChanged").textContent = monthItems.filter(item => item.changed).length.toLocaleString();
  $("#statCommittee").textContent = monthItems.filter(item => ["소관위", "법사위"].includes(item.stage)).length.toLocaleString();
  $("#statCompleted").textContent = monthItems.filter(item => ["본회의", "공포·시행"].includes(item.stage)).length.toLocaleString();
  $("#resultCount").textContent = `${list.length.toLocaleString()}건`;
  renderCards(list);
}

function renderCards(items) {
  const list = $("#billList");
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<div class="empty">조건에 맞는 법안이 없습니다.</div>`;
    return;
  }
  const template = $("#billCardTemplate");
  items.forEach(item => {
    const card = template.content.cloneNode(true);
    card.querySelector(".badges").innerHTML = `
      <span class="badge stage">${escapeHtml(item.stage)}</span>
      <span class="badge">${escapeHtml(item.agency)}</span>
      ${item.changed ? '<span class="badge changed">이번 달 변동</span>' : ''}`;
    card.querySelector(".changed-date").textContent = item.changedDate;
    card.querySelector(".bill-title").textContent = item.title;
    card.querySelector(".bill-meta").textContent = `${item.billNo} · ${item.committee} · ${item.proposer}`;
    card.querySelector(".progress-track").innerHTML = STAGES.map((stage, index) => {
      const current = STAGES.indexOf(item.stage);
      const className = index < current ? "step done" : index === current ? "step done current" : "step";
      return `<span class="${className}">${stage}</span>`;
    }).join("");
    card.querySelector(".change-text").textContent = item.change;
    card.querySelector(".summary").textContent = item.summary;
    card.querySelector(".previous-stage").textContent = `전월: ${item.previousStage}`;
    const link = card.querySelector(".source-link");
    link.href = item.sourceUrl;
    list.appendChild(card);
  });
}

function downloadWordReport() {
  const items = filteredItems();
  if (!items.length) {
    window.alert("현재 조회 조건에 해당하는 법안이 없습니다.");
    return;
  }

  const rows = items.map((item, index) => {
    const summary = summarizeForReport(item);
    return `
      <tr>
        <td class="number">${index + 1}</td>
        <td>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="sub">${escapeHtml(item.billNo)}</span>
          <span class="sub">${escapeHtml(item.proposer)}</span>
        </td>
        <td>
          ${escapeHtml(item.agency)}
          <span class="sub">${escapeHtml(item.committee)}</span>
        </td>
        <td>
          <strong>${escapeHtml(item.previousStage)} → ${escapeHtml(item.stage)}</strong>
          <span class="sub">${escapeHtml(item.change)}</span>
          <span class="sub">기준일 ${escapeHtml(item.changedDate)}</span>
        </td>
        <td class="summary-cell">
          ${escapeHtml(summary)}
          ${item.sourceUrl ? `<span class="source"><a href="${escapeHtml(item.sourceUrl)}">공식 원문 보기</a></span>` : ""}
        </td>
      </tr>`;
  }).join("");

  const filters = [
    state.agency && `소관기관: ${state.agency}`,
    state.stage && `진행단계: ${state.stage}`,
    state.query && `검색어: ${state.query}`,
    state.changedOnly && "이번 달 변동만"
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
      <title>${formatMonth(state.month)} 입법 진행현황 보고서</title>
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
        .sub, .source { display: block; margin-top: 3pt; color: #475569; font-size: 8pt; }
        .summary-cell { line-height: 1.5; white-space: pre-line; }
        a { color: #1d4ed8; text-decoration: underline; }
        .note { margin-top: 7pt; color: #64748b; font-size: 7.5pt; }
      </style>
    </head>
    <body><div class="WordSection1">
      <h1>${formatMonth(state.month)} 입법 진행현황 보고서</h1>
      <p class="meta">조회조건: ${escapeHtml(filters)} · 총 ${items.length.toLocaleString()}건 · 작성일 ${escapeHtml(generatedAt)}</p>
      <table>
        <colgroup>
          <col style="width:4%"><col style="width:22%"><col style="width:13%"><col style="width:16%"><col style="width:45%">
        </colgroup>
        <thead><tr><th>번호</th><th>법안 정보</th><th>소관 기관</th><th>진행 현황</th><th>주요내용 요약</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="note">※ 주요내용은 원문에서 현행 내용·문제점·개정 목적을 중심으로 최대 3개 항목·180자 이내로 정리했습니다. 정확한 내용은 공식 원문을 확인해 주세요.</p>
    </div></body></html>`;
  const blob = new Blob(["\ufeff", content], { type: "application/msword" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${state.month}_입법진행현황.doc`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
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
