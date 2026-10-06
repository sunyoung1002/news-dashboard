const STAGES = ["접수", "소관위", "법사위", "본회의", "공포·시행"];
const REPORT_SUMMARY_MAX_POINTS = 3;
const REPORT_SUMMARY_MAX_CHARS = 180;
const COMPARISON_SUMMARY_MAX_POINTS = 2;
const COMPARISON_SUMMARY_MAX_CHARS = 190;
const FAVORITES_STORAGE_KEY = "newsDashboard.favoriteBillIds.v1";
const FAVORITE_CATEGORIES = [
  { id: "political-affairs", label: "정무위", keywords: ["정무위", "독점규제및공정거래", "공정거래법", "자본시장과금융투자업", "자본시장법", "금융투자업", "하도급거래공정화", "하도급법", "하도급거래"] },
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
    card.querySelector(".bill-meta").textContent = `${item.billNo || "의안번호 확인 중"} · ${item.proposer || "발의자 확인 중"}`;
    card.querySelector(".progress-track").innerHTML = STAGES.map((stage, index) => {
      const current = STAGES.indexOf(item.stage);
      const className = index < current ? "step done" : index === current ? "step done current" : "step";
      return `<span class="${className}">${stage}</span>`;
    }).join("");
    card.querySelector(".change-text").textContent = item.change;
    card.querySelector(".summary").textContent = briefSummary(item, 170);
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

