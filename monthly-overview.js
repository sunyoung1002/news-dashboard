/* 월별 발의 / 소관위 / 관련위 심사. 기존 즐겨찾기와 비교 기능은 유지한다. */
(function () {
  "use strict";
  const committees = [
    ["정무위", "정무"], ["법사위", "법제사법"], ["산자중기위", "산업통상자원중소벤처기업|산업통상"],
    ["기후노동위", "기후에너지환경노동|기후에너지환경|환경노동|기후노동"], ["재경위", "재정경제기획|기획재정|재정경제"],
    ["국토위", "국토교통"], ["과방위", "과학기술정보방송통신"], ["행안위", "행정안전"],
    ["농해수위", "농림축산식품해양수산"], ["문체위", "문화체육관광"], ["복지위", "보건복지"],
    ["국방위", "국방"], ["외통위", "외교통일"], ["운영위", "국회운영"], ["교육위", "교육"],
    ["성평등가족위", "성평등가족|여성가족"], ["정보위", "정보"], ["기타 및 미정", ""]
  ];
  state.committeeFilter = "";
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
  function proposalDate(item) { return validDate(item.proposeDate); }
  function reviews(item) {
    try {
      const value = typeof item.relatedCommitteeReviews === "string"
        ? JSON.parse(item.relatedCommitteeReviews || "[]") : item.relatedCommitteeReviews;
      return Array.isArray(value) ? value.filter(row => row && typeof row === "object") : [];
    } catch (_) { return []; }
  }
  function completed(item) { return Boolean(item.isCompleted) || /가결|부결|폐기|철회|종결|만료/.test(item.processingResult || "") || ["본회의", "공포·시행"].includes(item.stage); }
  function pendingCommittee(item) {
    return ["소관위", "관련위", "관련위 심사"].includes(item.stage) &&
      !/폐기|철회|부결|가결|의결/.test(item.processingResult || "");
  }
  function relatedReview(item) {
    return pendingCommittee(item) && reviews(item).some(row => validDate(row.presentDate) && !validDate(row.processDate) && !/가결|의결|부결|완료|종결|폐기|철회/.test(row.result || ""));
  }
  function committeeLabel(item) {
    const name = String(item.committee || "").replace(/\s+/g, "");
    return committees.find(([label, pattern]) => label === name || (pattern && new RegExp(pattern).test(name)))?.[0] || "기타 및 미정";
  }
  const key = item => String(item.billNo || "").match(/\d{7}/)?.[0] || item.billId || itemKey(item);
  function unique(items) {
    const rows = new Map();
    items.forEach(item => rows.set(key(item), item));
    return [...rows.values()];
  }
  function latestItem(id) {
    const candidates = state.data.filter(item => itemKey(item) === id);
    candidates.sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")) || String(b.officialDetailCheckedAt || "").localeCompare(String(a.officialDetailCheckedAt || "")) || String(b.changedDate || "").localeCompare(String(a.changedDate || "")));
    return candidates[0] || state.favoriteRows.get(id);
  }
  favoriteItems = function () {
    return [...state.favoriteIds].map(latestItem).filter(Boolean).sort((a, b) => String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko") || String(a.title || "").localeCompare(String(b.title || ""), "ko"));
  };
  function monthItems() {
    if (window.AssemblyScope?.active()) return window.AssemblyScope.monthItems();
    return unique(state.data.filter(item => item.month === state.month));
  }
  function proposedItems() {
    if (window.AssemblyScope?.active()) return window.AssemblyScope.proposedItems();
    // 과거 월에는 해당 월 스냅샷을 우선 사용하고, 당시 스냅샷이 없을 때만 다른 월의 발의정보를 사용한다.
    const all = unique([...state.data].sort((a, b) => String(a.month).localeCompare(String(b.month))));
    const selected = new Map(all.map(item => [key(item), item]));
    monthItems().forEach(item => selected.set(key(item), { ...selected.get(key(item)), ...item,
      proposeDate: item.proposeDate || selected.get(key(item))?.proposeDate || "" }));
    return [...selected.values()].filter(item => proposalDate(item).startsWith(state.month));
  }
  function matches(item) {
    const filter = state.statFilter;
    if (filter === "all") return proposalDate(item).startsWith(state.month);
    if (filter === "changed") return pendingCommittee(item) && (!state.committeeFilter || committeeLabel(item) === state.committeeFilter);
    if (filter === "committee") return relatedReview(item);
    if (filter === "completed") return completed(item);
    return true;
  }
  const originalFilteredItems = filteredItems;
  filteredItems = function () {
    if (!state.statFilter && !window.AssemblyScope?.active()) return originalFilteredItems();
    const rows = state.statFilter === "all" ? proposedItems() : monthItems();
    const query = state.query.toLowerCase();
    return rows.filter(item => (!state.statFilter || matches(item)) &&
      (!state.stage || state.stage === item.stage) && (!state.agency || state.agency === item.agency) &&
      (!state.changedOnly || item.changed) && (!state.selectedOnly || state.selectedIds.has(itemKey(item))) &&
      (!state.favoriteOnly || state.favoriteIds.has(itemKey(item))) &&
      (!query || `${item.title} ${item.billNo} ${item.proposer} ${item.agency} ${item.committee} ${item.summary}`.toLowerCase().includes(query)))
      .sort((a, b) => state.sort === "title" ? a.title.localeCompare(b.title, "ko") : state.sort === "stage"
        ? STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage) : String(b.changedDate || "").localeCompare(String(a.changedDate || "")));
  };
  function updateOverview() {
    const rows = monthItems();
    const labels = { statTotal: `${Number(state.month.split("-")[1])}월 ${window.AssemblyScope?.active() ? "접수의안" : "발의 법안"}`, statChanged: "소관위", statCommittee: "상임위", statCompleted: "의결·공포" };
    const counts = { statTotal: proposedItems().length, statChanged: rows.filter(pendingCommittee).length,
      statCommittee: rows.filter(relatedReview).length, statCompleted: rows.filter(completed).length };
    Object.entries(labels).forEach(([id, label]) => {
      const number = document.getElementById(id);
      if (!number) return;
      number.textContent = counts[id].toLocaleString();
      const card = number.closest(".stat-card");
      card.querySelector(":scope > span").textContent = label;
      card.querySelector("small")?.remove();
      number.setAttribute("aria-label", `${label} ${counts[id]}건 보기`);
      if (id === "statTotal") number.title = window.AssemblyScope?.active() ? "선택 대수의 전체 의안 중 공식 발의·접수일이 조회 월인 의안 수. 법률안 외 의안과 처리의안도 포함합니다." : "공식 발의일이 조회 월에 해당하는 수집 법안 수. 발의일 미확인 자료는 집계에서 제외됩니다.";
      if (id === "statCommittee") number.title = "소관위 법안 중 공식 관련위 심사정보에 상정일이 있고 처리가 완료되지 않은 법안";
    });
    let panel = document.getElementById("committeeOverview");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "committeeOverview";
      panel.className = "committee-overview";
      panel.setAttribute("aria-label", "소관위원회별 법안");
      document.querySelector(".stats").insertAdjacentElement("afterend", panel);
      panel.addEventListener("click", event => {
        const button = event.target.closest("button[data-committee]");
        if (!button) return;
        state.committeeFilter = button.dataset.committee;
        render();
      });
    }
    panel.hidden = state.statFilter !== "changed";
    if (!panel.hidden) {
      const items = rows.filter(pendingCommittee);
      panel.innerHTML = [["전체", "전체"], ...committees].map(([label]) => {
        const value = label === "전체" ? "" : label;
        const count = value ? items.filter(item => committeeLabel(item) === value).length : items.length;
        return `<button type="button" class="committee-icon${state.committeeFilter === value ? " active" : ""}" data-committee="${escapeHtml(value)}" aria-pressed="${state.committeeFilter === value}"><span class="committee-symbol" aria-hidden="true">▤</span><span>${label}</span><b>${count.toLocaleString()}</b></button>`;
      }).join("");
    }
  }
  const originalRender = render;
  render = function () { originalRender(); updateOverview(); };
  document.querySelector("#monthSelect")?.addEventListener("change", () => { state.committeeFilter = ""; }, true);
  document.querySelector("#resetFilters")?.addEventListener("click", () => { state.committeeFilter = ""; }, true);
  function committeeDatesMarkup(item) {
    // COMMITTEE_DT만 회부일이다. CMT_PRESENT_DT 및 변경일을 회부일로 대체하지 않는다.
    const referral = validDate(item.committeeDate);
    const related = reviews(item).filter(row => validDate(row.presentDate));
    return `<span>소관위 회부일: ${escapeHtml(referral || "공식 회부일 확인 중")}</span>` + related.map(row =>
      `<span>상임위 상정일: ${escapeHtml(row.presentDate)}${row.committee ? ` (${escapeHtml(row.committee)} · 관련위)` : " (관련위)"}</span>`).join("");
  }
  function progressMarkup(item) {
    const current = STAGES.indexOf(item.stage);
    return `<ol class="detail-progress" aria-label="현재 진행단계: ${escapeHtml(item.stage || "확인 중")}">${STAGES.map((stage, index) =>
      `<li class="${index < current ? "past" : index === current ? "current" : "waiting"}"${index === current ? ' aria-current="step"' : ""}><i aria-hidden="true">${index < current ? "✓" : index + 1}</i><span>${stage}</span></li>`).join("")}</ol>`;
  }
  window.MonthlyBillUI = { committees, proposalDate, reviews, pendingCommittee, relatedReview, committeeLabel,
    monthItems, proposedItems, latestItem, matches, committeeDatesMarkup, progressMarkup, validDate };
  const scopeScript = document.createElement("script");
  const scopeUrl = new URL("assembly-browser.js", document.currentScript?.src || document.baseURI);
  scopeUrl.searchParams.set("v", "20261022-assembly1");
  scopeScript.src = scopeUrl.href;
  scopeScript.onerror = () => console.warn("assembly-browser.js를 불러오지 못해 기존 월별 화면을 유지합니다.");
  document.head.appendChild(scopeScript);
})();
