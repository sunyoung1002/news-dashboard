/* DAILY_CHANGE_SPLIT: favorites and interactive controls */
(function () {
  const {
    STAT_FILTERS,
    billNumber,
    trackingStatus,
    shortBillSummary,
    isDailyChanged
  } = window.LegislationDailyUI;

  function installAlternativeTrackingControls() {
    const list = document.querySelector("#billList");
    if (!list || list.dataset.alternativeTrackingBound) return;
    list.dataset.alternativeTrackingBound = "true";
    list.addEventListener("click", event => {
      const button = event.target.closest("button[data-track-search]");
      if (!button) return;
      state.query = button.dataset.trackSearch;
      const input = document.querySelector("#searchInput");
      if (input) input.value = state.query;
      render();
      document.querySelector(".results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function clearOrdinaryFilters() {
    state.stage = "";
    state.agency = "";
    state.query = "";
    state.changedOnly = false;
    state.selectedOnly = false;
    state.favoriteOnly = false;
    const agency = document.querySelector("#agencyFilter");
    const search = document.querySelector("#searchInput");
    const changed = document.querySelector("#changedOnly");
    if (agency) agency.value = "";
    if (search) search.value = "";
    if (changed) changed.checked = false;
    document.querySelectorAll("#stageFilters .chip").forEach(chip =>
      chip.classList.toggle("active", chip.dataset.stage === "")
    );
  }

  function applyStatFilter(filterId) {
    clearOrdinaryFilters();
    state.statFilter = filterId;
    render();
    document.querySelector(".results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function installStatControls() {
    Object.entries(STAT_FILTERS).forEach(([elementId, filter]) => {
      const number = document.getElementById(elementId);
      if (!number) return;
      number.classList.add("stat-number-button");
      number.dataset.statFilter = filter.id;
      number.setAttribute("role", "button");
      number.setAttribute("tabindex", "0");
      number.setAttribute("aria-label", `${filter.label}만 진행현황에서 보기`);
    });

    const stats = document.querySelector(".stats");
    if (!stats || stats.dataset.filterBound) return;
    stats.dataset.filterBound = "true";
    stats.addEventListener("click", event => {
      const number = event.target.closest("[data-stat-filter]");
      if (number) applyStatFilter(number.dataset.statFilter);
    });
    stats.addEventListener("keydown", event => {
      const number = event.target.closest("[data-stat-filter]");
      if (number && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        applyStatFilter(number.dataset.statFilter);
      }
    });

    document.querySelector("#resetFilters")?.addEventListener("click", () => {
      state.statFilter = "";
    }, true);

    ["#agencyFilter", "#searchInput", "#changedOnly"].forEach(selector => {
      document.querySelector(selector)?.addEventListener("input", () => {
        state.statFilter = "";
      }, true);
    });
    document.querySelector("#stageFilters")?.addEventListener("click", () => {
      state.statFilter = "";
    }, true);
  }

  function updateStatControls() {
    Object.values(STAT_FILTERS).forEach(filter => {
      const number = document.querySelector(`[data-stat-filter="${filter.id}"]`);
      const card = number?.closest(".stat-card");
      const active = state.statFilter === filter.id;
      card?.classList.toggle("stat-filter-active", active);
      number?.setAttribute("aria-pressed", String(active));
    });
  }

  function markDailyTitles(container, items) {
    container?.querySelectorAll("[data-view-favorite-id]").forEach(button => {
      const item = items.find(entry => itemKey(entry) === button.dataset.viewFavoriteId);
      button.classList.toggle("daily-changed-title", Boolean(item && isDailyChanged(item)));
      if (item && isDailyChanged(item)) {
        button.setAttribute("title", `오늘 변동: ${(item.dailyChangeFields || ["세부내용"]).join(", ")}`);
      }
    });
  }

  function todayChangeRows(item) {
    if (!isDailyChanged(item)) return [];
    if (Array.isArray(item.dailyChangeDetails) && item.dailyChangeDetails.length) {
      return item.dailyChangeDetails.map(detail => ({
        label: detail.label || detail.field || "세부내용",
        value: detail.before && detail.after
          ? `${detail.before} → ${detail.after}`
          : detail.after || "정보가 갱신되었습니다."
      }));
    }
    const fields = item.dailyChangeFields?.length ? item.dailyChangeFields : ["세부내용"];
    return fields.map(label => {
      if (label === "진행단계") return { label, value: `${item.previousStage || "-"} → ${item.stage || "-"}` };
      if (label === "처리내용") return { label, value: item.change || "처리결과가 갱신되었습니다." };
      if (label === "주요내용") return { label, value: "공식 제안이유 및 주요내용이 갱신되었습니다." };
      if (label === "신규 확인") return { label, value: `${item.billNo || "신규 의안"}이 새로 확인되었습니다.` };
      const currentValues = {
        "법안명": item.title, "의안번호": item.billNo, "소관기관": item.agency,
        "소관위원회": item.committee, "제안자": item.proposer, "처리결과": item.processingResult
      };
      return { label, value: currentValues[label] || "정보가 갱신되었습니다." };
    });
  }

  function favoriteTraceBriefMarkup(item) {
    const status = trackingStatus(item);
    if (status.state === "pending") return "";
    return `<div class="favorite-trace-brief favorite-trace-${escapeHtml(status.state)}">
      <b>통합·대안 추적</b><span>${escapeHtml(status.label)}</span>
      <small>${escapeHtml(status.detail[0])}</small>
    </div>`;
  }

  function appendFavoriteTracking(container, items) {
    container?.querySelectorAll("[data-view-favorite-id]").forEach(button => {
      const item = items.find(entry => itemKey(entry) === button.dataset.viewFavoriteId);
      const row = button.closest("li");
      if (!item || !row) return;
      row.querySelector(":scope > .favorite-trace-brief")?.remove();
      row.insertAdjacentHTML("beforeend", favoriteTraceBriefMarkup(item));
    });
  }

  function favoriteDetailTrackingMarkup(item) {
    const status = trackingStatus(item);
    if (status.state === "pending") return "";
    const track = status.track;
    const related = status.state === "alternative" && track
      ? `<ul>${track.originals.map(original => `<li>
          <div><b>원안 ${escapeHtml(billNumber(original) || "번호 확인 중")}</b><span>${escapeHtml(original.proposer)}</span></div>
          <strong>대안반영폐기</strong><p>${escapeHtml(original.reflected)}</p>
          <a href="${escapeHtml(original.sourceUrl)}" target="_blank" rel="noreferrer">원안 보기 ↗</a>
        </li>`).join("")}</ul>`
      : `<div class="favorite-tracking-result"><b>${escapeHtml(status.result)}</b><p>${escapeHtml(status.detail[0])}</p>${track?.alternative?.sourceUrl ? `<a href="${escapeHtml(track.alternative.sourceUrl)}" target="_blank" rel="noreferrer">연결 대안 ${escapeHtml(track.alternativeNo || "원문")} 보기 ↗</a>` : ""}</div>`;
    return `<section class="favorite-detail-tracking favorite-trace-${escapeHtml(status.state)}">
      <h3>통합·대안 추적</h3><p class="favorite-tracking-label">${escapeHtml(status.label)}</p>${related}
      <small>공식 의안번호와 국회 대안정보를 기준으로 표시합니다. 조문별 실제 반영 정도는 심사보고서 확인이 필요합니다.</small>
    </section>`;
  }

  function todayChangeMarkup(item) {
    const rows = todayChangeRows(item);
    if (!rows.length) return "";
    const changedDate = item.dailyChangedDate || item.changedDate || "";
    const heading = changedDate ? `오늘(${changedDate}) 변경 항목` : "오늘 변경 항목";
    return `<section class="favorite-today-change"><h3>${escapeHtml(heading)}</h3><ul>${rows.map(row =>
      `<li><b>${escapeHtml(row.label)}</b><span>${escapeHtml(row.value)}</span></li>`
    ).join("")}</ul></section>`;
  }

  function restoreCommitteeGroups() {
    const host = document.querySelector("#favoriteAgencyGroups");
    if (!host) return;

    const committeeDefinitions = [
      {
        id: "political-affairs",
        label: "정무위",
        categoryIds: ["fair-trade", "capital-markets", "subcontracting"]
      }
    ];

    committeeDefinitions.forEach(committee => {
      const categorySections = committee.categoryIds.map(categoryId =>
        host.querySelector(`[data-view-favorite-category="${categoryId}"]`)?.closest(".favorite-agency-group")
      ).filter(Boolean);
      if (!categorySections.length) return;

      const wrapper = document.createElement("section");
      wrapper.className = "favorite-committee-section";
      wrapper.dataset.favoriteCommittee = committee.id;
      wrapper.innerHTML = `
        <div class="favorite-committee-head">
          <span>${escapeHtml(committee.label)}</span>
          <small>${categorySections.reduce((count, section) => {
            const categoryId = section.querySelector("[data-view-favorite-category]")?.dataset.viewFavoriteCategory;
            const group = favoriteCategoryGroups().find(entry => entry.id === categoryId);
            return count + (group?.items.length || 0);
          }, 0).toLocaleString()}건</small>
        </div>
        <div class="favorite-committee-grid"></div>`;

      host.insertBefore(wrapper, categorySections[0]);
      const grid = wrapper.querySelector(".favorite-committee-grid");
      categorySections.forEach(section => grid.appendChild(section));
    });
  }

  const originalRenderFavoritesPanel = renderFavoritesPanel;
  renderFavoritesPanel = function () {
    originalRenderFavoritesPanel();
    const groups = favoriteCategoryGroups();
    document.querySelectorAll("[data-view-favorite-category]").forEach(button => {
      const group = groups.find(entry => entry.id === button.dataset.viewFavoriteCategory);
      if (!group) return;
      const dailyCount = group.items.filter(isDailyChanged).length;
      const label = button.querySelector(":scope > span");
      if (label) {
        label.classList.add("favorite-group-label");
        label.innerHTML = `<span>${escapeHtml(group.label)}</span><em>변동: ${dailyCount.toLocaleString()}건</em>`;
      }
    });
    markDailyTitles(document.querySelector("#favoriteAgencyGroups"), favoriteItems());
    appendFavoriteTracking(document.querySelector("#favoriteAgencyGroups"), favoriteItems());
    restoreCommitteeGroups();
  };

  const originalOpenFavoriteCategory = openFavoriteCategory;
  openFavoriteCategory = function (categoryId) {
    originalOpenFavoriteCategory(categoryId);
    const group = favoriteCategoryGroups().find(entry => entry.id === categoryId);
    if (!group) return;
    const dailyCount = group.items.filter(isDailyChanged).length;
    const count = document.querySelector("#favoriteCategoryCount");
    if (count) count.textContent = `즐겨찾기 ${group.items.length.toLocaleString()}건 · 오늘 변동 ${dailyCount.toLocaleString()}건`;
    markDailyTitles(document.querySelector("#favoriteCategoryItems"), group.items);
    appendFavoriteTracking(document.querySelector("#favoriteCategoryItems"), group.items);
  };

  const originalOpenFavoriteDetail = openFavoriteDetail;
  openFavoriteDetail = function (itemId) {
    originalOpenFavoriteDetail(itemId);
    const item = state.data.find(entry => itemKey(entry) === itemId) || state.favoriteRows.get(itemId);
    const summary = document.querySelector("#favoriteDetailSummary");
    if (item && summary) summary.textContent = shortBillSummary(item);
    const stageBox = document.querySelector("#favoriteDetailStage");
    if (item && stageBox) {
      const transition = `${item.previousStage || "-"} → ${item.stage || "-"}`;
      const stageDate = item.stageDate || item.changedDate || "";
      const present = item.committeePresentDate ? ` · 상정일: ${item.committeePresentDate}` : "";
      const current = `${item.stage || "-"} · ${stageDate}${item.stage === "소관위" ? present : ""}`;
      const committeeDate = item.committeeDate || item.committeePresentDate || "";
      const committee = item.stage !== "소관위" && committeeDate
        ? `<span>소관위 · ${escapeHtml(committeeDate)}${escapeHtml(present)}</span>` : "";
      stageBox.innerHTML = `<strong>${escapeHtml(transition)}</strong><span>${escapeHtml(current)}</span>${committee}`;
    }
    const body = document.querySelector("#favoriteDetailDialog .favorite-detail-body");
    body?.querySelectorAll(".favorite-today-change, .favorite-detail-tracking").forEach(element => element.remove());
    const actions = body?.querySelector(".favorite-detail-actions");
    if (item && actions) {
      actions.insertAdjacentHTML("beforebegin", `${todayChangeMarkup(item)}${favoriteDetailTrackingMarkup(item)}`);
    }
  };

  const originalRender = render;
  render = function () {
    originalRender();
    updateStatControls();
  };

  installStatControls();
  installAlternativeTrackingControls();
})();
