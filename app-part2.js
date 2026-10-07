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
  const source = normalizeFavoriteCategoryText(`${item.title || ""} ${item.category || ""}`);
  const fallback = normalizeFavoriteCategoryText(item.summary || "");
  const matches = (category, text) => category.id !== "other" &&
    category.keywords.some(keyword => text.includes(normalizeFavoriteCategoryText(keyword)));
  return FAVORITE_CATEGORIES.find(category => matches(category, source)) ||
    FAVORITE_CATEGORIES.find(category => matches(category, fallback)) ||
    FAVORITE_CATEGORIES.find(category => category.id === "other");
}

function briefSummary(item, maxLength = 90) {
  const content = cleanBillSummary(item);
  if (isMissingBillSummary(content)) {
    return "주요내용 데이터가 없습니다.";
  }
  const sentence = content.match(/^.{10,}?[.!?](?=\s|$)/)?.[0] || content;
  if (sentence.length <= maxLength) return sentence;
  const cut = sentence.slice(0, maxLength - 1).replace(/\s+\S*$/, "").trim();
  return `${cut || sentence.slice(0, maxLength - 1)}…`;
}

function cleanBillSummary(item, allowOtherMonths = true) {
  let content = String(item.summary || "")
    .replace(/(?:창|장)\s*닫기/g, " ")
    .replace(/\[\s*\d{5,}\s*\]/g, " ")
    .replace(/의안\s*번호\s*[:：]?\s*(?:제\s*)?\d+(?:호)?/g, " ")
    .replace(/제안이유\s*및\s*주요내용|제안이유|주요내용/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const prefix of [item.title, item.proposer, item.billNo]) {
    const value = String(prefix || "").trim();
    if (value && content.startsWith(value)) content = content.slice(value.length).trim();
  }
  content = content.replace(/^(?:의원\s*등?\s*\d+인?|등\s*\d+인?)\s*/, "").trim();
  if (allowOtherMonths && isMissingBillSummary(content) && item.billNo) {
    const otherMonth = state.data.find(entry => entry !== item &&
      String(entry.billNo || "") === String(item.billNo) &&
      !isMissingBillSummary(cleanBillSummary(entry, false)));
    if (otherMonth) return cleanBillSummary(otherMonth, false);
  }
  return content;
}

function isMissingBillSummary(content) {
  return !content || /해당\s*의안\s*정보를\s*찾을\s*수\s*없습니다|확인\s*중입니다/.test(content);
}

function displayBillNo(item) {
  return String(item.billNo || "").replace(/^(?:의안\s*번호\s*[:：]?\s*)+/g, "").trim();
}

function summarizeForPopup(item) {
  const content = cleanBillSummary(item);
  if (isMissingBillSummary(content)) return "주요내용 데이터가 없습니다. 공식 원문에서 확인해 주세요.";
  const complete = splitReportSentences(content).filter(sentence => /[.!?]$/.test(sentence));
  if (!complete.length) return content.length > 360 ? `${content.slice(0, 360).trim()}…` : content;
  const selected = [];
  let length = 0;
  for (const sentence of complete) {
    if (selected.length >= 4 || (selected.length && length + sentence.length > 330)) break;
    selected.push(sentence);
    length += sentence.length;
  }
  return selected.join(" ");
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
  const politicalIds = new Set(["fair-trade", "capital-markets", "subcontracting"]);
  const politicalGroups = FAVORITE_CATEGORIES.filter(category => politicalIds.has(category.id))
    .map(category => groups.find(group => group.id === category.id) || { ...category, items: [] });
  const otherGroups = groups.filter(group => !politicalIds.has(group.id));

  $("#favoriteHeaderCount").textContent = items.length.toLocaleString();
  $("#favoritesStatus").textContent = items.length
    ? `내 즐겨찾기 ${items.length.toLocaleString()}건을 ${groups.length.toLocaleString()}개 관심 분야로 분류했습니다. 이 브라우저에서만 표시됩니다.`
    : "내 즐겨찾기가 아직 없습니다. 각 법안 제목 앞 별표를 눌러 등록해 주세요.";
  $("#toggleFavoriteOnly").disabled = items.length === 0;
  $("#toggleFavoriteOnly").textContent = state.favoriteOnly ? "전체 법안 보기" : "즐겨찾기만 보기";
  $("#downloadFavorites").disabled = items.length === 0;
  $("#favoriteAgencyGroups").innerHTML = `
    <section class="favorite-committee-group" aria-labelledby="politicalAffairsTitle">
      <h3 id="politicalAffairsTitle">정무위</h3>
      <div class="favorite-committee-items">${politicalGroups.map(renderFavoriteGroup).join("")}</div>
    </section>
    ${otherGroups.map(renderFavoriteGroup).join("")}`;
}

function renderFavoriteGroup(group) {
  return `
    <section class="favorite-agency-group favorite-topic-group">
      <div class="favorite-group-head">
        <button class="favorite-group-title" type="button" data-view-favorite-category="${escapeHtml(group.id)}">
          <span>${escapeHtml(group.label)}</span><small>${group.items.length.toLocaleString()}건 · 전체보기 ›</small>
        </button>
      </div>
      <ul>${group.items.length ? group.items.slice(0, 3).map(item => `
        <li class="favorite-item">
          <span class="favorite-remove" aria-hidden="true">★</span>
          <div class="favorite-item-main">
            <button class="favorite-item-title" type="button" data-view-favorite-id="${escapeHtml(itemKey(item))}">${escapeHtml(item.title)}</button>
            <span>${escapeHtml(item.billNo || "의안번호 확인 중")} · ${escapeHtml(item.proposer || "발의자 확인 중")}</span>
            <span class="favorite-item-summary">${escapeHtml(briefSummary(item))}</span>
          </div>
          <div class="favorite-item-actions"></div>
        </li>`).join("") : `<li class="favorite-more">등록된 법안이 없습니다.</li>`}${group.items.length > 3 ? `<li class="favorite-more">분야명을 누르면 전체 ${group.items.length.toLocaleString()}건을 볼 수 있습니다.</li>` : ""}</ul>
    </section>`;
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
  $("#favoriteDetailMeta").textContent = `${item.agency || "기타"} · ${item.committee || "위원회 확인 중"} · 의안번호 ${displayBillNo(item) || "확인 중"} · ${item.proposer || "발의자 확인 중"}`;
  const alternatives = item.alternativeBills || [];
  const alternativeLine = item.processingResult === "대안반영폐기"
    ? `<span>반영 대안: ${alternatives.length
      ? alternatives.map(alt => `<a href="${escapeHtml(alt.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(alt.billNo)} · ${escapeHtml(alt.title)}</a>`).join(", ")
      : "공식 대안정보에서 연결 의안을 확인 중입니다."}</span>` : "";
  $("#favoriteDetailStage").innerHTML = `<strong>${escapeHtml(item.previousStage || "-")} → ${escapeHtml(item.stage || "-")}</strong><span>${escapeHtml(item.change || "변동 내용 확인 중")} · ${escapeHtml(item.changedDate || "")}</span>${alternativeLine}`;
  $("#favoriteDetailSummary").textContent = summarizeForPopup(item);
  const source = $("#favoriteDetailSource");
  source.href = item.sourceUrl || "#";
  source.hidden = !item.sourceUrl;
  $("#downloadFavoriteDetail").dataset.billId = itemId;
  $("#favoriteDetailDialog").showModal();
}

function openFavoriteCategory(categoryId) {
  const group = favoriteCategoryGroups().find(entry => entry.id === categoryId) ||
    (FAVORITE_CATEGORIES.some(category => category.id === categoryId)
      ? { ...FAVORITE_CATEGORIES.find(category => category.id === categoryId), items: [] } : null);
  if (!group) return;
  $("#favoriteCategoryTitle").textContent = group.label;
  $("#favoriteCategoryCount").textContent = `즐겨찾기에 등록된 법안 ${group.items.length.toLocaleString()}건`;
  $("#downloadFavoriteCategoryDialog").dataset.categoryId = categoryId;
  $("#downloadFavoriteCategoryDialog").disabled = group.items.length === 0;
  $("#favoriteCategoryItems").innerHTML = group.items.map(item => `
    <li class="favorite-category-item">
      <button class="favorite-item-title" type="button" data-view-favorite-id="${escapeHtml(itemKey(item))}">${escapeHtml(item.title)}</button>
      <span>${escapeHtml(item.billNo || "의안번호 확인 중")} · ${escapeHtml(item.proposer || "발의자 확인 중")}</span>
      <span class="favorite-item-summary">${escapeHtml(briefSummary(item))}</span>
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
