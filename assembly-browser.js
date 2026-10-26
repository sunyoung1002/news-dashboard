/* Full 21st/22nd term catalogs. Public JSON only: never use an API key here. */
(function () {
  "use strict";
  if (window.AssemblyScope) return;
  const scriptBase = document.currentScript?.src || document.baseURI;
  const catalogs = new Map();
  let manifest = null, selectedTerm = "22", busy = false, notice = "", installed = false;
  const urlFor = name => new URL(name, scriptBase).href;
  const billNo = item => String(item.billNo || "").match(/\d{7}/)?.[0] || "";
  const termOf = item => String(item.assemblyTerm || billNo(item).slice(0, 2));
  // Limit live cards, not the filtered dataset used for counts and reports.
  const pageSize = 100;
  let pageRows = [], pageOffset = 0;
  const originalRenderCards = renderCards;
  function paintPage() {
    const host = document.getElementById("billList");
    originalRenderCards(pageRows.slice(pageOffset, pageOffset + pageSize));
    if (!host) return;
    let pager = document.getElementById("billListPagination");
    if (!pager) {
      pager = document.createElement("nav");
      pager.id = "billListPagination";
      pager.setAttribute("aria-label", "법안 목록 페이지");
      pager.style.cssText = "display:flex;gap:12px;align-items:center;justify-content:center;margin:16px 0;flex-wrap:wrap";
      const previous = document.createElement("button");
      previous.type = "button"; previous.className = "secondary-button"; previous.textContent = "이전 100건";
      const status = document.createElement("span"); status.setAttribute("aria-live", "polite");
      const next = document.createElement("button");
      next.type = "button"; next.className = "secondary-button"; next.textContent = "다음 100건";
      pager.append(previous, status, next);
      previous.addEventListener("click", () => { pageOffset = Math.max(0, pageOffset - pageSize); paintPage(); host.scrollIntoView({ block: "start" }); });
      next.addEventListener("click", () => { pageOffset = Math.min(Math.floor((pageRows.length - 1) / pageSize) * pageSize, pageOffset + pageSize); paintPage(); host.scrollIntoView({ block: "start" }); });
      host.insertAdjacentElement("afterend", pager);
    }
    pager.hidden = pageRows.length <= pageSize;
    pager.style.display = pager.hidden ? "none" : "flex";
    pager.children[0].disabled = pageOffset === 0;
    pager.children[1].textContent = pageRows.length ? `${(pageOffset + 1).toLocaleString()}–${Math.min(pageOffset + pageSize, pageRows.length).toLocaleString()} / 전체 ${pageRows.length.toLocaleString()}건` : "0건";
    pager.children[2].disabled = pageOffset + pageSize >= pageRows.length;
  }
  renderCards = function (items) {
    if (items.length !== pageRows.length || items.some((item, index) => item !== pageRows[index])) pageOffset = 0;
    pageRows = items;
    paintPage();
  };
  const currentMonth = () => manifest?.terms?.[selectedTerm]?.checkedAt?.slice(0, 7) || "";
  const final = item => Boolean(item.isCompleted) || /가결|부결|폐기|철회|종결|만료/.test(item.processingResult || "");
  const active = () => catalogs.has(selectedTerm);
  function proposedItems() {
    return (catalogs.get(selectedTerm) || []).filter(item => String(item.proposeDate || "").startsWith(state.month));
  }
  function monthItems() {
    const rows = catalogs.get(selectedTerm) || [];
    if (selectedTerm === "22" && state.month === currentMonth()) {
      return rows.filter(item => !final(item) || [item.proposeDate, item.processDate, item.promulgationDate].some(date => String(date || "").startsWith(state.month)));
    }
    // No fabricated historical snapshots: past months show their proposal cohort
    // with the latest known/final status, clearly identified in the notice.
    return proposedItems();
  }
  window.AssemblyScope = { active, monthItems, proposedItems, termOf };

  function paintNotice() {
    const node = document.getElementById("assemblyCollectionNote");
    if (!node) return;
    let content = notice;
    if (active() && !busy && !notice) {
      const record = manifest.terms[selectedTerm];
      const all = proposedItems().length;
      const laws = proposedItems().filter(item => item.isLaw).length;
      const undated = record.unknownProposalDateCount || 0;
      content = `${selectedTerm}대 전체 ${record.count.toLocaleString()}건 · 공식 API 목록 대조 ${record.checkedAt} · 선택 월 접수의안 ${all.toLocaleString()}건 / 법률안 ${laws.toLocaleString()}건`;
      if (undated) content += ` · 접수일 미확인 ${undated}건은 월 집계에서 제외`;
      if (selectedTerm === "21" || state.month !== currentMonth()) content += " · 과거 월은 해당 월 발의·접수 의안의 최종 확인 상태입니다.";
      else content += " · 국회 웹 통계와 비교할 때 기준일·의안 종류를 맞춰 주세요.";
    }
    node.textContent = content;
    node.hidden = !content;
  }

  function setMonths() {
    const select = document.querySelector("#monthSelect");
    const record = manifest?.terms?.[selectedTerm];
    if (!select || !record) return;
    const months = Object.keys(record.months || {}).sort().reverse();
    if (selectedTerm === "22" && !months.includes(currentMonth())) months.unshift(currentMonth());
    if (!months.includes(state.month)) state.month = months[0] || currentMonth();
    select.innerHTML = months.filter(Boolean).map(month => `<option value="${escapeHtml(month)}">${formatMonth(month)}</option>`).join("");
    select.value = state.month;
  }

  async function loadTerm(term) {
    if (busy) return;
    const previous = selectedTerm;
    const control = document.getElementById("assemblyTermSelect");
    busy = true;
    if (control) control.disabled = true;
    notice = `${term}대 전체 의안 자료를 불러오는 중입니다.`;
    paintNotice();
    try {
      const record = manifest?.terms?.[term];
      if (!record?.verified) throw new Error(`${term}대 검증된 수집본이 없습니다.`);
      if (!catalogs.has(term)) {
        const url = new URL(record.file, scriptBase);
        if (url.origin !== new URL(scriptBase).origin || !/^assembly-(21|22)\.json$/.test(record.file)) throw new Error("수집 파일 경로가 올바르지 않습니다.");
        url.searchParams.set("v", manifest.updatedAt);
        const response = await fetch(url.href, { cache: "no-store" });
        if (!response.ok) throw new Error(`${term}대 수집 파일을 불러오지 못했습니다.`);
        const payload = await response.json();
        if (!Array.isArray(payload.items) || payload.assemblyTerm !== term || payload.updatedAt !== record.checkedAt || payload.items.length !== record.count || payload.items.some(item => termOf(item) !== term) || new Set(payload.items.map(billNo)).size !== record.count) throw new Error(`${term}대 수집 파일과 검증 목록이 일치하지 않습니다. 새로고침해 주세요.`);
        catalogs.set(term, payload.items);
        // Preserve snapshots and stored favorite IDs. Put current metadata first
        // for existing detail handlers that resolve a row with Array.find().
        state.data = [...payload.items, ...state.data];
        const agencies = document.querySelector("#agencyFilter");
        if (agencies) {
          const existing = new Set([...agencies.options].map(option => option.value));
          const names = [...new Set(payload.items.map(item => item.agency).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
          names.filter(name => !existing.has(name)).forEach(name => {
            const option = document.createElement("option"); option.value = name; option.textContent = name; agencies.appendChild(option);
          });
        }
      }
      selectedTerm = term;
      state.assemblyTerm = term;
      const updated = document.getElementById("updatedAt");
      if (updated) updated.textContent = `기준일 ${record.checkedAt}`;
      state.committeeFilter = "";
      state.statFilter = "all";
      document.querySelectorAll(".stat-card").forEach(card => card.classList.toggle("active", Boolean(card.querySelector("#statTotal"))));
      setMonths();
      notice = "";
      render();
    } catch (error) {
      selectedTerm = previous;
      notice = error.message;
      if (control) control.value = previous;
    } finally {
      busy = false;
      if (control) control.disabled = false;
      paintNotice();
    }
  }

  async function install() {
    if (installed || !state.data.length) return;
    const month = document.querySelector("#monthSelect");
    if (!month || !month.options.length) return;
    installed = true;
    const select = document.createElement("select"); select.id = "assemblyTermSelect"; select.setAttribute("aria-label", "국회 대수 선택");
    for (const term of ["22", "21"]) {
      const option = document.createElement("option"); option.value = term; option.textContent = `${term}대`; select.appendChild(option);
    }
    const note = document.createElement("p"); note.id = "assemblyCollectionNote"; note.setAttribute("role", "status");
    note.style.cssText = "font-size:12px;color:#52647a;margin:8px 0;line-height:1.5";
    document.querySelector(".stats")?.insertAdjacentElement("beforebegin", note);
    select.addEventListener("change", event => loadTerm(event.target.value));
    try {
      const response = await fetch(urlFor("assembly-index.json"), { cache: "no-store" });
      if (!response.ok) throw new Error("전체 의안 수집본 준비 전입니다. 기존 자료를 표시합니다.");
      manifest = await response.json();
      if (manifest.schemaVersion !== 1 || !manifest.terms) throw new Error("수집 목록 형식을 확인해 주세요.");
      await loadTerm("22");
    } catch (error) {
      notice = error.message; select.disabled = true; paintNotice();
    }
  }
  const previousRender = render;
  render = function () { previousRender(); paintNotice(); if (!installed) install(); };
  if (state.data.length) install();
})();
