const STAGES = ["접수", "소관위", "법사위", "본회의", "공포·시행"];

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
  const rows = items.map((item, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.billNo)}</td><td>${escapeHtml(item.agency)}</td><td>${escapeHtml(item.previousStage)} → ${escapeHtml(item.stage)}</td><td>${escapeHtml(item.change)}</td><td>${escapeHtml(item.summary)}</td></tr>`).join("");
  const content = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Malgun Gothic';font-size:10pt}h1{text-align:center}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:6px;vertical-align:top}th{background:#eaf2ff}</style></head><body><h1>${formatMonth(state.month)} 입법 진행현황 보고서</h1><p>총 ${items.length}건</p><table><thead><tr><th>번호</th><th>법안명</th><th>의안번호</th><th>소관기관</th><th>진행상태</th><th>월간 변동</th><th>주요내용 요약</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", content], { type: "application/msword" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${state.month}_입법진행현황.doc`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
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
