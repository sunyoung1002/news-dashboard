const STAGES = ["접수", "소관위", "법사위", "본회의", "공포·시행"];
const REPORT_SUMMARY_MAX_POINTS = 3;
const REPORT_SUMMARY_MAX_CHARS = 180;
const COMPARISON_SUMMARY_MAX_POINTS = 2;
const COMPARISON_SUMMARY_MAX_CHARS = 190;
const FAVORITES_STORAGE_KEY = "newsDashboard.favoriteBillIds.v1";
const FAVORITE_CATEGORIES = [
  { id: "fair-trade", label: "공정거래법", keywords: ["독점규제및공정거래", "공정거래법"] },
  { id: "capital-markets", label: "자본시장법", keywords: ["자본시장과금융투자업", "자본시장법", "금융투자업"] },
  { id: "subcontracting", label: "하도급법", keywords: ["하도급거래공정화", "하도급법", "하도급거래"] },
  { id: "commercial-litigation", label: "상법·집단소송·민사소송", keywords: ["상법", "집단소송", "민사소송법", "민사소송"] },
  { id: "mutual-growth", label: "상생협력법", keywords: ["대중소기업상생협력", "상생협력법", "상생협력"] },
  { id: "carbon-labor-youth", label: "탄소중립법·노동법·청년고용", keywords: ["탄소중립", "기후위기대응", "노동법", "노동", "근로기준법", "노동조합", "산업안전", "중대재해", "최저임금", "청년고용", "고용"] },
  { id: "inheritance-gift-tax", label: "상속세·증여세법", keywords: ["상속세및증여세법", "상속세", "증여세"] },
  { id: "other", label: "기타 주요법안", keywords: [] }
];
const REQUIRED_AGENCIES = [
  "공정거래위원회",
  "중소벤처기업부",
  "기후에너지환경부",
  "고용노동부",
  "국토교통부"
];

const state = {
  data: [],
  month: "2026-09",
  stage: "",
  agency: "",
  query: "",
  changedOnly: false,
  sort: "changed",
  compareIds: new Set(),
  selectedIds: new Set(),
  selectedOnly: false,
  favoriteIds: new Set(),
  favoriteRows: new Map(),
  legacyFavoriteIds: new Set(),
  favoriteOnly: false,
  sharedFavoritesAvailable: false,
  favoritesConnectionError: ""
};

const $ = (selector) => document.querySelector(selector);

async function loadData() {
  const response = await fetch("sample-bills.json", { cache: "no-store" });
  if (!response.ok) throw new Error("표시 데이터를 불러오지 못했습니다.");
  const payload = await response.json();
  state.data = payload.items;
  $("#updatedAt").textContent = `기준일 ${payload.updatedAt}`;
  ensureComparisonUi();
  await loadFavoriteIds();
  buildControls();
  bindEvents();
  render();
}

function buildControls() {
  const months = [...new Set(state.data.map(item => item.month))].sort().reverse();
  $("#monthSelect").innerHTML = months.map(month => `<option value="${month}">${formatMonth(month)}</option>`).join("");
  state.month = months[0];

  const agencies = [...new Set([...REQUIRED_AGENCIES, ...state.data.map(item => item.agency).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "ko"));
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
    state.stage = ""; state.agency = ""; state.query = ""; state.changedOnly = false; state.sort = "changed"; state.selectedOnly = false; state.favoriteOnly = false;
    $("#agencyFilter").value = ""; $("#searchInput").value = ""; $("#changedOnly").checked = false; $("#sortSelect").value = "changed";
    document.querySelectorAll("#stageFilters .chip").forEach(chip => chip.classList.toggle("active", chip.dataset.stage === ""));
    render();
  });
  $("#downloadReport").addEventListener("click", downloadWordReport);
  $("#billList").addEventListener("click", handleBillAction);
  $("#billList").addEventListener("change", handleBillSelectionChange);
  $("#clearCompare").addEventListener("click", clearComparison);
  $("#openCompare").addEventListener("click", openComparison);
  $("#clearCollection").addEventListener("click", clearCollection);
  $("#toggleSelectedOnly").addEventListener("click", toggleSelectedOnly);
  $("#downloadSelected").addEventListener("click", downloadSelectedWordReport);
  $("#favoritesShortcut").addEventListener("click", showFavoritesPage);
  $("#closeFavorites").addEventListener("click", showDashboardPage);
  $("#toggleFavoriteOnly").addEventListener("click", toggleFavoriteOnly);
  $("#downloadFavorites").addEventListener("click", downloadFavoriteWordReport);
  $("#favoriteAgencyGroups").addEventListener("click", handleFavoritePanelAction);
  $("#downloadFavoriteCategoryDialog").addEventListener("click", event => downloadFavoriteCategoryWordReport(event.currentTarget.dataset.categoryId));
  $("#closeFavoriteCategory").addEventListener("click", () => $("#favoriteCategoryDialog").close());
  $("#favoriteCategoryDialog").addEventListener("click", event => {
    if (event.target === $("#favoriteCategoryDialog")) $("#favoriteCategoryDialog").close();
    const detailButton = event.target.closest("button[data-view-favorite-id]");
    if (detailButton) openFavoriteDetail(detailButton.dataset.viewFavoriteId);
  });
  $("#downloadFavoriteDetail").addEventListener("click", event => downloadFavoriteItemWordReport(event.currentTarget.dataset.billId));
  $("#closeFavoriteDetail").addEventListener("click", () => $("#favoriteDetailDialog").close());
  $("#favoriteDetailDialog").addEventListener("click", event => {
    if (event.target === $("#favoriteDetailDialog")) $("#favoriteDetailDialog").close();
  });
  $("#selectedBills").addEventListener("click", handleComparePillRemove);
  $("#collectedBills").addEventListener("click", handleCollectionPillRemove);
  $("#downloadComparison").addEventListener("click", downloadComparisonWordReport);
  $("#closeCompare").addEventListener("click", () => $("#compareDialog").close());
  $("#compareDialog").addEventListener("click", event => {
    if (event.target === $("#compareDialog")) $("#compareDialog").close();
  });
}

function filteredItems() {
  const stageIndex = stage => STAGES.indexOf(stage);
  const result = state.data.filter(item => {
    const haystack = `${item.title} ${item.billNo} ${item.agency} ${item.committee} ${item.summary}`.toLowerCase();
    return item.month === state.month && (!state.selectedOnly || state.selectedIds.has(itemKey(item))) &&
      (!state.favoriteOnly || state.favoriteIds.has(itemKey(item))) &&
      (!state.agency || item.agency === state.agency) &&
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
  renderCompareTray();
  renderCollectionTray();
  renderFavoritesPanel();
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
    const id = itemKey(item);
    const article = card.querySelector(".bill-card");
    article.dataset.billId = id;
    article.classList.toggle("comparison-selected", state.compareIds.has(id));
    article.classList.toggle("collection-selected", state.selectedIds.has(id));
    article.classList.toggle("favorite-selected", state.favoriteIds.has(id));
    card.querySelector(".badges").innerHTML = `
      <span class="badge stage">${escapeHtml(item.stage)}</span>
      <span class="badge">${escapeHtml(item.agency)}</span>
      ${item.changed ? '<span class="badge changed">이번 달 변동</span>' : ''}`;
    card.querySelector(".changed-date").textContent = item.changedDate;
    card.querySelector(".bill-title").textContent = item.title;
    ensureCardFavoriteButton(card);
    const favoriteButton = card.querySelector(".favorite-toggle");
    favoriteButton.dataset.billId = id;
    favoriteButton.textContent = state.favoriteIds.has(id) ? "★" : "☆";
    favoriteButton.setAttribute("aria-pressed", String(state.favoriteIds.has(id)));
    favoriteButton.setAttribute("aria-label", state.favoriteIds.has(id) ? "내 즐겨찾기에서 제거" : "내 즐겨찾기에 추가");
    ensureCardSelectionCheckbox(card);
    const selectionCheckbox = card.querySelector(".bill-select-checkbox");
    selectionCheckbox.checked = state.selectedIds.has(id);
    selectionCheckbox.dataset.billId = id;
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
    ensureCardComparisonActions(card);
    const compareButton = card.querySelector(".compare-toggle");
    compareButton.textContent = state.compareIds.has(id) ? "선택 해제" : "비교 선택";
    compareButton.setAttribute("aria-pressed", String(state.compareIds.has(id)));
    list.appendChild(card);
  });
}

function ensureComparisonUi() {
  if (!$("#favoritesShortcut")) {
    $("#downloadReport").insertAdjacentHTML("beforebegin", `<button class="favorite-shortcut" id="favoritesShortcut" type="button">★ 주요법안현황 <span id="favoriteHeaderCount">0</span></button>`);
  }
  if (!$("#favoritesPage")) {
    document.body.insertAdjacentHTML("beforeend", `
      <main class="favorites-page page-shell" id="favoritesPage" hidden>
       <section class="favorites-page-card" aria-labelledby="favoritesTitle">
        <div class="favorites-page-head">
          <div><span class="section-kicker">FAVORITE BILLS</span><h2 id="favoritesTitle">★ 주요법안현황</h2><p id="favoritesStatus">별표를 눌러 필요한 법안을 모아 주세요.</p></div>
          <button class="secondary-button" id="closeFavorites" type="button">← 월간 현황으로 돌아가기</button>
        </div>
        <div class="favorites-page-toolbar compare-tray-actions">
          <button class="secondary-button" id="toggleFavoriteOnly" type="button" disabled>즐겨찾기만 보기</button>
          <button class="favorite-word-button" id="downloadFavorites" type="button" disabled>주요법안 Word</button>
        </div>
        <div class="favorite-agency-groups" id="favoriteAgencyGroups"></div>
       </section>
      </main>`);
  }
  if (!$("#favoriteDetailDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="favorite-detail-dialog" id="favoriteDetailDialog" aria-labelledby="favoriteDetailTitle">
        <div class="favorite-detail-head"><div><span class="section-kicker">BILL DETAIL</span><h2 id="favoriteDetailTitle">법안 상세</h2></div><button class="dialog-close" id="closeFavoriteDetail" type="button" aria-label="법안 상세 닫기">×</button></div>
        <div class="favorite-detail-body"><p class="favorite-detail-meta" id="favoriteDetailMeta"></p><div class="favorite-detail-stage" id="favoriteDetailStage"></div><h3>주요내용</h3><div class="favorite-detail-summary" id="favoriteDetailSummary"></div><div class="favorite-detail-actions"><a class="source-link" id="favoriteDetailSource" target="_blank" rel="noreferrer">공식 원문 보기 ↗</a><button class="favorite-word-button" id="downloadFavoriteDetail" type="button">이 법안 Word 출력</button></div></div>
      </dialog>`);
  }
  if (!$("#favoriteCategoryDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="favorite-category-dialog" id="favoriteCategoryDialog" aria-labelledby="favoriteCategoryTitle">
        <div class="favorite-detail-head"><div><span class="section-kicker">FAVORITE CATEGORY</span><h2 id="favoriteCategoryTitle">관심 분야</h2><p class="favorite-category-count" id="favoriteCategoryCount"></p></div><div class="dialog-actions"><button class="favorite-word-button" id="downloadFavoriteCategoryDialog" type="button">Word 출력</button><button class="dialog-close" id="closeFavoriteCategory" type="button" aria-label="분야별 법안 목록 닫기">×</button></div></div>
        <div class="favorite-category-body"><ul class="favorite-category-list" id="favoriteCategoryItems"></ul></div>
      </dialog>`);
  }
  if (!$("#compareTray")) {
    const stats = $(".stats");
    stats.insertAdjacentHTML("afterend", `
      <section class="compare-tray" id="compareTray" aria-live="polite">
        <div>
          <strong>법안 비교</strong>
          <span id="compareStatus">각 법안 카드에서 비교할 법안을 2~4개 선택해 주세요.</span>
          <div class="selected-bills" id="selectedBills"></div>
        </div>
        <div class="compare-tray-actions">
          <button class="secondary-button" id="clearCompare" type="button">선택 초기화</button>
          <button class="compare-button" id="openCompare" type="button" disabled>선택 법안 비교</button>
        </div>
      </section>`);
  }

  if (!$("#collectionTray")) {
    $("#compareTray").insertAdjacentHTML("afterend", `
      <section class="collection-tray" id="collectionTray" aria-live="polite">
        <div>
          <strong>선택 법안 보관함</strong>
          <span id="collectionStatus">법안 제목 앞 체크박스로 원하는 법안을 담아 주세요.</span>
          <div class="selected-bills" id="collectedBills"></div>
        </div>
        <div class="compare-tray-actions">
          <button class="secondary-button" id="toggleSelectedOnly" type="button" disabled>선택 항목만 보기</button>
          <button class="secondary-button" id="clearCollection" type="button" disabled>보관함 비우기</button>
          <button class="compare-button" id="downloadSelected" type="button" disabled>선택 법안 Word</button>
        </div>
      </section>`);
  }

  if (!$("#compareDialog")) {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="compare-dialog" id="compareDialog" aria-labelledby="compareTitle">
        <div class="dialog-head">
          <div><span class="section-kicker">BILL COMPARISON</span><h2 id="compareTitle">선택 법안 비교</h2></div>
          <div class="dialog-actions">
            <button class="compare-button" id="downloadComparison" type="button">비교표 Word</button>
            <button class="dialog-close" id="closeCompare" type="button" aria-label="비교창 닫기">×</button>
          </div>
        </div>
        <div class="common-keywords" id="commonKeywords"></div>
        <div class="compare-table-wrap" id="compareContent"></div>
      </dialog>`);
  }
  if (!$("#downloadComparison")) {
    const head = $("#compareDialog .dialog-head");
    const closeButton = $("#closeCompare");
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const downloadButton = document.createElement("button");
    downloadButton.className = "compare-button";
    downloadButton.id = "downloadComparison";
    downloadButton.type = "button";
    downloadButton.textContent = "비교표 Word";
    actions.appendChild(downloadButton);
    if (closeButton) actions.appendChild(closeButton);
    head.appendChild(actions);
  }
  ensureComparisonStyles();
}

function ensureCardComparisonActions(card) {
  if (card.querySelector(".compare-toggle")) return;
  const footer = card.querySelector(".card-footer");
  if (!footer) return;
  const sourceLink = footer.querySelector(".source-link");
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.innerHTML = `
    <button class="card-action similar-button" type="button">유사 법안 추천</button>
    <button class="card-action compare-toggle" type="button">비교 선택</button>`;
  if (sourceLink) actions.appendChild(sourceLink);
  footer.appendChild(actions);
}

function ensureCardSelectionCheckbox(card) {
  if (card.querySelector(".bill-select-checkbox")) return;
  const title = card.querySelector(".bill-title");
  if (!title) return;
  const heading = document.createElement("div");
  heading.className = "bill-heading-row";
  const checkbox = document.createElement("input");
  checkbox.className = "bill-select-checkbox";
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "이 법안을 보관함에 선택");
  title.parentNode.insertBefore(heading, title);
  heading.appendChild(checkbox);
  heading.appendChild(title);
}

function ensureCardFavoriteButton(card) {
  if (card.querySelector(".favorite-toggle")) return;
  const heading = card.querySelector(".bill-heading-row");
  if (!heading) return;
  const button = document.createElement("button");
  button.className = "favorite-toggle";
  button.type = "button";
  heading.insertBefore(button, heading.firstChild);
}

function ensureComparisonStyles() {
  if ($("#comparisonFallbackStyles")) return;
  const style = document.createElement("style");
  style.id = "comparisonFallbackStyles";
  style.textContent = `
    .compare-tray,.collection-tray{margin:0 0 16px;padding:18px 20px;border:1px solid #9fc3ff;border-radius:16px;background:#eef5ff;display:flex;align-items:center;justify-content:space-between;gap:20px}.collection-tray{margin-bottom:24px;border-color:#9ed8bd;background:#effaf5}
    .compare-tray[hidden]{display:none}.selected-bills,.compare-tray-actions,.card-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.selected-bills{margin-top:10px}
    .selected-pill{padding:5px 8px;border-radius:999px;background:#fff;border:1px solid #c8dcff;font-size:11px}.compare-button,.secondary-button,.card-action{border-radius:9px;padding:8px 11px;font-weight:800}
    .compare-button{border:0;background:#1f6feb;color:#fff}.compare-button:disabled{opacity:.45}.secondary-button,.card-action{border:1px solid #d9e2ec;background:#fff;color:#243b53}.card-action{font-size:11px}
    .bill-heading-row{display:flex;align-items:flex-start;gap:10px}.favorite-toggle{width:30px;height:30px;margin-top:10px;border:0;background:transparent;color:#e6a700;font-size:25px;line-height:1}.bill-select-checkbox{width:19px;height:19px;margin-top:17px;accent-color:#138a5b;flex:0 0 auto}.bill-heading-row .bill-title{flex:1}.bill-card.comparison-selected{border-color:#1f6feb;box-shadow:0 0 0 3px rgba(31,111,235,.11)}.compare-toggle[aria-pressed=true]{border-color:#1f6feb;background:#eaf2ff;color:#1f6feb}
    .compare-dialog{width:min(1380px,calc(100vw - 36px));max-height:calc(100vh - 36px);padding:0;border:0;border-radius:18px}.compare-dialog::backdrop{background:rgba(15,34,57,.6)}
    .dialog-head,.dialog-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.dialog-head{padding:20px 24px;border-bottom:1px solid #d9e2ec}.dialog-close{width:38px;height:38px;border:0;border-radius:50%;font-size:25px}
    .common-keywords,.compare-table-wrap{padding:14px 24px}.compare-table-wrap{overflow:auto}.compare-table{width:100%;min-width:860px;border-collapse:collapse}.compare-table th,.compare-table td{padding:12px;border:1px solid #d9e2ec;vertical-align:top;font-size:13px}
    .common-keywords span,.keyword{display:inline-block;margin:3px;padding:4px 7px;border-radius:999px;background:#e4efff;color:#225ea8;font-size:11px}
    @media(max-width:900px){.compare-tray,.collection-tray{align-items:flex-start;flex-direction:column}.card-footer{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function handleBillAction(event) {
  const card = event.target.closest(".bill-card");
  if (!card) return;
  const item = state.data.find(row => itemKey(row) === card.dataset.billId);
  if (!item) return;

  if (event.target.closest(".compare-toggle")) {
    toggleComparison(item);
  } else if (event.target.closest(".similar-button")) {
    selectSimilarBills(item);
  } else if (event.target.closest(".favorite-toggle")) {
    toggleFavorite(item);
  }
}

function handleBillSelectionChange(event) {
  const checkbox = event.target.closest(".bill-select-checkbox");
  if (!checkbox) return;
  const id = checkbox.dataset.billId;
  if (checkbox.checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  const card = checkbox.closest(".bill-card");
  if (card) card.classList.toggle("collection-selected", checkbox.checked);
  renderCollectionTray();
}

function toggleComparison(item) {
  const id = itemKey(item);
  if (state.compareIds.has(id)) {
    state.compareIds.delete(id);
  } else {
    if (state.compareIds.size >= 4) {
      window.alert("법안은 한 번에 최대 4개까지 비교할 수 있습니다.");
      return;
    }
    state.compareIds.add(id);
  }
  renderCards(filteredItems());
  renderCompareTray();
}

function selectSimilarBills(baseItem) {
  const candidates = state.data
    .filter(item => item.month === state.month && itemKey(item) !== itemKey(baseItem))
    .map(item => ({ item, score: billSimilarity(baseItem, item) }))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ko"))
    .slice(0, 3)
    .filter(entry => entry.score > 0);

  state.compareIds = new Set([itemKey(baseItem), ...candidates.map(entry => itemKey(entry.item))]);
  renderCards(filteredItems());
  renderCompareTray();
  if (state.compareIds.size >= 2) openComparison();
  else window.alert("비교할 만한 유사 법안을 찾지 못했습니다.");
}

function renderCompareTray() {
  const tray = $("#compareTray");
  const items = selectedComparisonItems();
  tray.hidden = false;
  $("#compareStatus").textContent = items.length === 0
    ? "각 법안 카드에서 직접 선택하거나 유사 법안을 추천받을 수 있습니다."
    : items.length < 2
    ? "1개 선택됨 · 비교하려면 1개 이상 더 선택하세요."
    : `${items.length}개 선택됨 · 최대 4개까지 비교할 수 있습니다.`;
  $("#selectedBills").innerHTML = items.map(item =>
    `<span class="selected-pill">${escapeHtml(shortTitle(item.title, 28))}<button type="button" data-remove-compare="${escapeHtml(itemKey(item))}" aria-label="비교 선택 해제">×</button></span>`
  ).join("");
  $("#openCompare").disabled = items.length < 2;
}

function renderCollectionTray() {
  const items = selectedCollectionItems();
  $("#collectionStatus").textContent = items.length
    ? `${items.length.toLocaleString()}개 법안이 보관되어 있습니다. 선택 항목만 모아 보거나 Word로 출력할 수 있습니다.`
    : "법안 제목 앞 체크박스로 원하는 법안을 담아 주세요.";
  $("#collectedBills").innerHTML = items.map(item =>
    `<span class="selected-pill collection-pill">${escapeHtml(shortTitle(item.title, 34))}<button type="button" data-remove-collection="${escapeHtml(itemKey(item))}" aria-label="보관함에서 제거">×</button></span>`
  ).join("");
  $("#toggleSelectedOnly").disabled = items.length === 0;
  $("#toggleSelectedOnly").textContent = state.selectedOnly ? "전체 법안 보기" : "선택 항목만 보기";
  $("#clearCollection").disabled = items.length === 0;
  $("#downloadSelected").disabled = items.length === 0;
}

function selectedCollectionItems() {
  return [...state.selectedIds]
    .map(id => state.data.find(item => itemKey(item) === id))
    .filter(Boolean);
}

function loadLegacyFavoriteIds() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    state.legacyFavoriteIds = new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch (error) {
    state.legacyFavoriteIds = new Set();
  }
}

async function loadFavoriteIds() {
  loadLegacyFavoriteIds();
  state.favoriteIds = new Set(state.legacyFavoriteIds);
  state.favoriteRows = new Map();
  state.sharedFavoritesAvailable = false;
  state.favoritesConnectionError = "";
}

function saveLocalFavoriteIds() {
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favoriteIds]));
  state.legacyFavoriteIds = new Set(state.favoriteIds);
}

function favoriteItems() {
  return [...state.favoriteIds]
    .map(id => state.data.find(item => itemKey(item) === id) || state.favoriteRows.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      const agencyOrder = String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko");
      return agencyOrder || String(a.title || "").localeCompare(String(b.title || ""), "ko");
    });
}

function normalizeFavoriteCategoryText(value) {
  return String(value || "").toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
}

function favoriteCategoryForItem(item) {
  const source = normalizeFavoriteCategoryText(`${item.title || ""} ${item.summary || ""}`);
  return FAVORITE_CATEGORIES.find(category =>
    category.id !== "other" && category.keywords.some(keyword => source.includes(normalizeFavoriteCategoryText(keyword)))
  ) || FAVORITE_CATEGORIES.find(category => category.id === "other");
}

function favoriteCategoryGroups(items = favoriteItems()) {
  const grouped = new Map(FAVORITE_CATEGORIES.map(category => [category.id, { ...category, items: [] }]));
  items.forEach(item => grouped.get(favoriteCategoryForItem(item).id).items.push(item));
  grouped.forEach(group => group.items.sort((a, b) =>
    String(b.changedDate || "").localeCompare(String(a.changedDate || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""), "ko")
  ));
  return [...grouped.values()].filter(group => group.items.length);
}

async function toggleFavorite(item) {
  const id = itemKey(item);
  if (state.favoriteIds.has(id)) {
    state.favoriteIds.delete(id);
  } else {
    state.favoriteIds.add(id);
  }
  saveLocalFavoriteIds();
  render();
}

function renderFavoritesPanel() {
  const items = favoriteItems();
  const groups = favoriteCategoryGroups(items);

  $("#favoriteHeaderCount").textContent = items.length.toLocaleString();
  $("#favoritesStatus").textContent = items.length
    ? `내 즐겨찾기 ${items.length.toLocaleString()}건을 ${groups.length.toLocaleString()}개 관심 분야로 분류했습니다. 이 브라우저에서만 표시됩니다.`
    : "내 즐겨찾기가 아직 없습니다. 각 법안 제목 앞 별표를 눌러 등록해 주세요.";
  $("#toggleFavoriteOnly").disabled = items.length === 0;
  $("#toggleFavoriteOnly").textContent = state.favoriteOnly ? "전체 법안 보기" : "즐겨찾기만 보기";
  $("#downloadFavorites").disabled = items.length === 0;
  $("#favoriteAgencyGroups").innerHTML = groups.map(group => `
    <section class="favorite-agency-group favorite-topic-group">
      <div class="favorite-group-head">
        <button class="favorite-group-title" type="button" data-view-favorite-category="${escapeHtml(group.id)}">
          <span>${escapeHtml(group.label)}</span><small>${group.items.length.toLocaleString()}건 · 전체보기 ›</small>
        </button>
      </div>
      <ul>${group.items.slice(0, 3).map(item => `
        <li class="favorite-item">
          <span class="favorite-remove" aria-hidden="true">★</span>
          <div class="favorite-item-main">
            <button class="favorite-item-title" type="button" data-view-favorite-id="${escapeHtml(itemKey(item))}">${escapeHtml(item.title)}</button>
            <span>${escapeHtml(item.agency || "기타")} · ${escapeHtml(item.billNo)} · ${escapeHtml(item.proposer)}</span>
          </div>
          <div class="favorite-item-actions">
            ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">원문 ↗</a>` : ""}
          </div>
        </li>`).join("")}${group.items.length > 3 ? `<li class="favorite-more">분야명을 누르면 전체 ${group.items.length.toLocaleString()}건을 볼 수 있습니다.</li>` : ""}</ul>
    </section>`).join("");
}

function toggleFavoriteOnly() {
  if (!state.favoriteIds.size) return;
  state.favoriteOnly = !state.favoriteOnly;
  render();
  showDashboardPage();
}

function showFavoritesPage() {
  $("#dashboardPage").hidden = true;
  $("#favoritesPage").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboardPage() {
  $("#favoritesPage").hidden = true;
  $("#dashboardPage").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openFavoriteDetail(itemId) {
  const item = state.data.find(entry => itemKey(entry) === itemId) || state.favoriteRows.get(itemId);
  if (!item) return;
  $("#favoriteDetailTitle").textContent = item.title;
  $("#favoriteDetailMeta").textContent = `${item.agency || "기타"} · ${item.committee || "위원회 확인 중"} · ${item.billNo || "의안번호 확인 중"} · ${item.proposer || "발의자 확인 중"}`;
  $("#favoriteDetailStage").innerHTML = `<strong>${escapeHtml(item.previousStage || "-")} → ${escapeHtml(item.stage || "-")}</strong><span>${escapeHtml(item.change || "변동 내용 확인 중")} · ${escapeHtml(item.changedDate || "")}</span>`;
  $("#favoriteDetailSummary").innerHTML = escapeHtml(item.summary || "공식 주요내용을 확인 중입니다.").replace(/\n/g, "<br>");
  const source = $("#favoriteDetailSource");
  source.href = item.sourceUrl || "#";
  source.hidden = !item.sourceUrl;
  $("#downloadFavoriteDetail").dataset.billId = itemId;
  $("#favoriteDetailDialog").showModal();
}

function openFavoriteCategory(categoryId) {
  const group = favoriteCategoryGroups().find(entry => entry.id === categoryId);
  if (!group) return;
  $("#favoriteCategoryTitle").textContent = group.label;
  $("#favoriteCategoryCount").textContent = `즐겨찾기에 등록된 법안 ${group.items.length.toLocaleString()}건`;
  $("#downloadFavoriteCategoryDialog").dataset.categoryId = categoryId;
  $("#favoriteCategoryItems").innerHTML = group.items.map(item => `
    <li class="favorite-category-item">
      <button class="favorite-item-title" type="button" data-view-favorite-id="${escapeHtml(itemKey(item))}">${escapeHtml(item.title)}</button>
      <span>${escapeHtml(item.agency || "기타")} · ${escapeHtml(item.billNo)} · ${escapeHtml(item.proposer)}</span>
      <small>${escapeHtml(item.previousStage || "-")} → ${escapeHtml(item.stage || "-")} · ${escapeHtml(item.changedDate || "")}</small>
      ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">공식 원문 보기 ↗</a>` : ""}
    </li>`).join("");
  $("#favoriteCategoryDialog").showModal();
}

function handleFavoritePanelAction(event) {
  const categoryButton = event.target.closest("button[data-view-favorite-category]");
  if (categoryButton) {
    openFavoriteCategory(categoryButton.dataset.viewFavoriteCategory);
    return;
  }
  const detailButton = event.target.closest("button[data-view-favorite-id]");
  if (detailButton) {
    openFavoriteDetail(detailButton.dataset.viewFavoriteId);
    return;
  }
}

function clearCollection() {
  state.selectedIds.clear();
  state.selectedOnly = false;
  render();
}

function toggleSelectedOnly() {
  if (!state.selectedIds.size) return;
  state.selectedOnly = !state.selectedOnly;
  render();
}

function handleCollectionPillRemove(event) {
  const button = event.target.closest("button[data-remove-collection]");
  if (!button) return;
  state.selectedIds.delete(button.dataset.removeCollection);
  if (!state.selectedIds.size) state.selectedOnly = false;
  render();
}

function handleComparePillRemove(event) {
  const button = event.target.closest("button[data-remove-compare]");
  if (!button) return;
  state.compareIds.delete(button.dataset.removeCompare);
  render();
}

function clearComparison() {
  state.compareIds.clear();
  renderCards(filteredItems());
  renderCompareTray();
}

function openComparison() {
  const items = selectedComparisonItems();
  if (items.length < 2) return;

  const common = commonBillKeywords(items);
  $("#commonKeywords").innerHTML = `<strong>공통 핵심어</strong> ${common.length ? common.map(word => `<span>${escapeHtml(word)}</span>`).join("") : "뚜렷한 공통 핵심어가 없습니다."}`;
  const rows = [
    ["법안명", item => `<strong>${escapeHtml(item.title)}</strong>`],
    ["의안번호", item => escapeHtml(item.billNo)],
    ["대표발의자", item => escapeHtml(item.proposer)],
    ["소관", item => `${escapeHtml(item.agency)}<br><span class="table-sub">${escapeHtml(item.committee)}</span>`],
    ["진행단계", item => `${escapeHtml(item.previousStage)} → <strong>${escapeHtml(item.stage)}</strong>`],
    ["최근 변동", item => `${escapeHtml(item.change)}<br><span class="table-sub">${escapeHtml(item.changedDate)}</span>`],
    ["주요 내용 요약", item => escapeHtml(summarizeForComparison(item)).replace(/\n/g, "<br>")],
    ["이 법안의 특징", item => distinctiveKeywords(item, items).map(word => `<span class="keyword">${escapeHtml(word)}</span>`).join("") || "-"],
    ["원문", item => item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">공식 원문 보기 ↗</a>` : "-"]
  ];
  $("#compareContent").innerHTML = `
    <table class="compare-table">
      <thead><tr><th>비교항목</th>${items.map((item, index) => `<th>법안 ${index + 1}<br><span>${escapeHtml(shortTitle(item.title, 24))}</span></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, renderCell]) => `<tr><th>${label}</th>${items.map(item => `<td>${renderCell(item)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  $("#compareDialog").showModal();
}

function selectedComparisonItems() {
  return [...state.compareIds]
    .map(id => state.data.find(item => itemKey(item) === id))
    .filter(Boolean);
}

function itemKey(item) {
  return String(item.billId || item.billNo || item.title);
}

function shortTitle(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function billTokens(item) {
  const stopWords = new Set([
    "일부개정법률안", "법률안", "법률", "관한", "현행법", "현행법은", "하려는", "하도록",
    "그리고", "그러나", "그런데", "대하여", "위하여", "관련", "경우", "내용", "제안이유",
    "주요내용", "의안", "상세정보", "인쇄", "창닫기", "있음", "있는", "있어", "따라",
    "등을", "등의", "대한", "통해", "하고", "하며", "현재", "최근"
  ]);
  const source = `${item.title || ""} ${item.summary || ""}`
    .replace(/창닫기|의안 상세정보|인쇄|제안이유\s*및\s*주요내용|제안이유|주요내용/g, " ")
    .replace(/\[\s*\d+\s*\]/g, " ");
  const matches = source.match(/[가-힣A-Za-z0-9]{2,}/g) || [];
  return new Set(matches.map(word => word.toLowerCase()).filter(word =>
    !stopWords.has(word) && word.length >= 2 && !/^\d+(인)?$/.test(word)
  ));
}

function billSimilarity(left, right) {
  const a = billTokens(left);
  const b = billTokens(right);
  const intersection = [...a].filter(word => b.has(word)).length;
  const union = new Set([...a, ...b]).size || 1;
  let score = intersection / union;
  if (left.agency === right.agency) score += 0.12;
  if (left.committee === right.committee) score += 0.08;
  return score;
}

function commonBillKeywords(items) {
  if (!items.length) return [];
  const sets = items.map(billTokens);
  return [...sets[0]].filter(word => sets.every(set => set.has(word))).slice(0, 8);
}

function distinctiveKeywords(item, allItems) {
  const own = billTokens(item);
  const others = allItems.filter(other => itemKey(other) !== itemKey(item)).map(billTokens);
  return [...own].filter(word => others.every(set => !set.has(word))).slice(0, 8);
}

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
    `즐겨찾기 개별 법안 · ${item.billNo || "의안번호 확인 중"}`
  );
}

function downloadItemsWordReport(items, reportTitle, filename, customFilterLabel = "", groupByAgency = false) {
  if (!items.length) {
    window.alert("Word 보고서로 출력할 법안이 없습니다.");
    return;
  }

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
    const summary = summarizeForComparison(item);
    return `${agencyRow}
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
        .sub, .source { display: block; margin-top: 3pt; color: #475569; font-size: 8pt; }
        .summary-cell { line-height: 1.5; white-space: pre-line; }
        .agency-group td { padding: 5pt 7pt; background: #eff6ff; color: #163f70; font-size: 10pt; font-weight: bold; }
        a { color: #1d4ed8; text-decoration: underline; }
        .note { margin-top: 7pt; color: #64748b; font-size: 7.5pt; }
      </style>
    </head>
    <body><div class="WordSection1">
      <h1>${escapeHtml(reportTitle)}</h1>
      <p class="meta">조회조건: ${escapeHtml(filters)} · 총 ${items.length.toLocaleString()}건 · 작성일 ${escapeHtml(generatedAt)}</p>
      <table>
        <colgroup>
          <col style="width:4%"><col style="width:22%"><col style="width:13%"><col style="width:16%"><col style="width:45%">
        </colgroup>
        <thead><tr><th>번호</th><th>법안 정보</th><th>소관 기관</th><th>진행 현황</th><th>주요내용 요약</th></tr></thead>
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
    ["진행단계", item => `${escapeHtml(item.previousStage)} → <strong>${escapeHtml(item.stage)}</strong>`],
    ["최근 변동", item => `${escapeHtml(item.change)}<br>${escapeHtml(item.changedDate)}`],
    ["주요 내용 요약", item => escapeHtml(summarizeForComparison(item)).replace(/\n/g, "<br>")],
    ["차별화 핵심어", item => distinctiveKeywords(item, items).map(escapeHtml).join(", ") || "-"] ,
    ["공식 원문", item => item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}">원문 보기</a>` : "-"]
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
  let text = String(item.summary || "")
    .replace(/창닫기|의안 상세정보|인쇄/g, " ")
    .replace(/\[\s*\d+\s*\]/g, " ")
    .replace(/제안이유\s*및\s*주요내용|제안이유|주요내용/g, " ");

  [item.title, item.proposer, item.billNo].filter(Boolean).forEach(value => {
    text = text.split(String(value)).join(" ");
  });
  text = text
    .replace(/의안번호\s*\d+/g, " ")
    .replace(/\.{3,}|…+/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.includes("확인 중입니다")) {
    return "공식 제안이유 및 주요내용을 확인 중입니다.";
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
