/* 오늘 변동 표시 + 월간 요약 카드 필터 (기존 app.js를 수정하지 않는 보조 파일) */
(function () {
  const STAT_FILTERS = {
    statTotal: { id: "all", label: "선택 월 전체 법안" },
    statChanged: { id: "changed", label: "이번 달 변동 법안" },
    statCommittee: { id: "committee", label: "위원회 심사 법안" },
    statCompleted: { id: "completed", label: "의결·공포 법안" }
  };

  state.statFilter = state.statFilter || "";

  function dashboardDate() {
    const match = String(document.querySelector("#updatedAt")?.textContent || "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  function isDailyChanged(item) {
    const date = dashboardDate();
    if (typeof item.dailyChanged === "boolean") {
      return Boolean(item.dailyChanged && date && item.dailyChangedDate === date);
    }
    return Boolean(date && item.changed && item.changedDate === date);
  }

  function matchesStatFilter(item) {
    if (!state.statFilter || state.statFilter === "all") return true;
    if (state.statFilter === "changed") return Boolean(item.changed);
    if (state.statFilter === "committee") return ["소관위", "법사위"].includes(item.stage);
    if (state.statFilter === "completed") return ["본회의", "공포·시행"].includes(item.stage);
    return true;
  }

  const originalFilteredItems = filteredItems;
  filteredItems = function () {
    return originalFilteredItems().filter(matchesStatFilter);
  };

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
  };

  const originalRender = render;
  render = function () {
    originalRender();
    updateStatControls();
  };

  installStatControls();
})();
