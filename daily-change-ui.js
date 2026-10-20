/* 오늘 변동 표시 + 월간 요약 카드 필터 (기존 app.js를 수정하지 않는 보조 파일) */
(function () {
  const STAT_FILTERS = {
    statTotal: { id: "all", label: "선택 월 전체 법안" },
    statChanged: { id: "changed", label: "이번 달 변동 법안" },
    statCommittee: { id: "committee", label: "위원회 심사 법안" },
    statCompleted: { id: "completed", label: "의결·공포 법안" }
  };
  const ALTERNATIVE_TRACKS = [
    {
      alternativeNo: "2220247",
      alternative: {
        month: "2026-09",
        billId: "PRC_V2X6R0E5I1T3Z1P7I5O7R0R2Q2R5T1",
        billNo: "의안번호 2220247",
        title: "독점규제 및 공정거래에 관한 법률 일부개정법률안(대안)",
        agency: "공정거래위원회",
        committee: "정무위원회",
        proposer: "정무위원장",
        stage: "공포·시행",
        previousStage: "본회의",
        changed: true,
        changedDate: "2026-09-08",
        change: "2026-08-20 원안가결 · 2026-09-08 공포 · 법률 제21904호",
        summary: "기술유용 피해기업의 손해배상 입증을 돕기 위해 자료제출명령 제도를 확대하고 영업비밀 보호를 위한 비밀유지명령 근거를 마련합니다. 공정거래위원회의 자료제출 의무와 신고인의 불복 절차를 보강해 피해구제의 실효성을 높입니다.",
        sourceUrl: "https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_V2X6R0E5I1T3Z1P7I5O7R0R2Q2R5T1"
      },
      originals: [
        {
          month: "2024-07", billId: "tracked-2202447", billNo: "의안번호 2202447",
          title: "독점규제 및 공정거래에 관한 법률 일부개정법률안", agency: "공정거래위원회",
          committee: "정무위원회", proposer: "강준현의원 등 12인", stage: "소관위", previousStage: "소관위",
          changed: false, changedDate: "2026-05-14", change: "대안반영폐기 · 대안 2220247에 통합",
          summary: "법원이 공정거래위원회에 조사자료와 심사보고서 등 증거 제출을 명령할 수 있도록 하고 불응 시 제재 근거를 마련하는 내용입니다.",
          reflected: "공정위 자료제출과 손해배상 입증 강화",
          sourceUrl: "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/2202447/detailRP"
        },
        {
          month: "2024-11", billId: "tracked-2205252", billNo: "의안번호 2205252",
          title: "독점규제 및 공정거래에 관한 법률 일부개정법률안", agency: "공정거래위원회",
          committee: "정무위원회", proposer: "유영하의원 등 11인", stage: "소관위", previousStage: "소관위",
          changed: false, changedDate: "2026-05-14", change: "대안반영폐기 · 대안 2220247에 통합",
          summary: "당사자 자료제출명령을 확대하고 공정거래위원회의 자료제출 의무와 영업비밀 비밀유지명령 제도를 마련하는 내용입니다.",
          reflected: "자료제출명령 확대와 비밀유지명령 도입",
          sourceUrl: "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/2205252/detailRP"
        },
        {
          month: "2026-03", billId: "PRC_Y2F6E0F3E2C7K0J9K3J0H5D7G5F2G4", billNo: "의안번호 2217825",
          title: "독점규제 및 공정거래에 관한 법률 일부개정법률안", agency: "공정거래위원회",
          committee: "정무위원회", proposer: "신장식의원 등 13인", stage: "소관위", previousStage: "소관위",
          changed: false, changedDate: "2026-05-14", change: "대안반영폐기 · 대안 2220247에 통합",
          summary: "법원이 요구한 손해배상 관련 자료를 공정거래위원회가 제출하도록 의무화하고 영업비밀 자료의 조건부 송부 근거를 마련하는 내용입니다.",
          reflected: "공정위 자료송부 의무화와 영업비밀 조건부 제출",
          sourceUrl: "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/2217825/detailRP?yType=I"
        }
      ]
    }
  ];

  state.statFilter = state.statFilter || "";

  function billNumber(item) {
    return (String(item?.billNo || "").match(/\d{7}/) || [""])[0];
  }

  function alternativeTrackFor(item) {
    const number = billNumber(item);
    const title = String(item?.title || "").replace(/\s+/g, "").trim();
    const fixed = ALTERNATIVE_TRACKS.find(track =>
      track.alternativeNo === number || track.originals.some(original => billNumber(original) === number)
      || (title && title === String(track.alternative.title || "").replace(/\s+/g, "").trim())
    );
    return fixed || dynamicAlternativeTrackFor(item);
  }

  function normalizedBillBaseTitle(item) {
    return String(item?.title || "")
      .replace(/\s*\(대안\)\s*/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function dynamicAlternativeTrackFor(item) {
    const baseTitle = normalizedBillBaseTitle(item);
    if (!baseTitle) return null;
    const rows = [...state.data, ...state.favoriteRows.values()];
    const unique = [...new Map(rows.map(row => [itemKey(row), row])).values()];
    const sameTitle = unique.filter(row => normalizedBillBaseTitle(row) === baseTitle);
    const alternatives = sameTitle.filter(row => /\(대안\)/.test(String(row.title || "")));
    const discarded = sameTitle.filter(row =>
      !/\(대안\)/.test(String(row.title || "")) &&
      /대안반영폐기/.test(`${row.processingResult || ""} ${row.change || ""}`)
    );
    const isAlternative = /\(대안\)/.test(String(item?.title || ""));
    const isDiscarded = /대안반영폐기/.test(`${item?.processingResult || ""} ${item?.change || ""}`);
    if ((!isAlternative || !discarded.length) && (!isDiscarded || !alternatives.length)) return null;

    const alternative = isAlternative ? item : alternatives[0];
    const originals = discarded.map(original => ({
      ...original,
      reflected: original.reflected || `원안 주요내용: ${shortBillSummary(original)}`
    }));
    return {
      alternativeNo: billNumber(alternative),
      alternative,
      originals
    };
  }

  function trackingStatus(item) {
    const track = alternativeTrackFor(item);
    const number = billNumber(item);
    if (track) {
      if (number === track.alternativeNo || /\(대안\)/.test(String(item?.title || ""))) {
        return {
          state: "alternative",
          label: `위원회 대안 · 흡수 원안 ${track.originals.length}건`,
          result: track.alternative.change,
          detail: track.originals.map(original => `${billNumber(original)} ${original.proposer}: ${original.reflected}`),
          track
        };
      }
      const original = track.originals.find(entry => billNumber(entry) === number);
      const targetLabel = track.alternativeNo ? `대안 ${track.alternativeNo}` : "연결 위원회 대안";
      return {
        state: "discarded",
        label: `대안반영폐기 → ${targetLabel}`,
        result: "처리결과: 대안반영폐기",
        detail: [original?.reflected || "위원회 대안에 일부 또는 전부 반영"],
        track,
        original
      };
    }

    const result = String(item?.processingResult || item?.procResult || item?.committeeResult || item?.result || "");
    const alternativeNo = String(item?.alternativeBillNo || item?.absorbedBy || "").match(/\d{7}/)?.[0] || "";
    if (/대안반영폐기/.test(`${result} ${item?.change || ""}`)) {
      return {
        state: "discarded",
        label: alternativeNo ? `대안반영폐기 → 대안 ${alternativeNo}` : "대안반영폐기 · 연결 대안 확인 중",
        result: "처리결과: 대안반영폐기",
        detail: [item?.reflected || "국회 대안정보에서 흡수된 위원회 대안을 확인 중입니다."]
      };
    }
    if (/\(대안\)/.test(String(item?.title || ""))) {
      const passed = `${result} ${item?.change || ""}`.match(/원안가결|수정가결|가결/);
      if (passed) {
        return {
          state: "alternative",
          label: `위원회 대안 · ${passed[0]}`,
          result: `처리결과: ${passed[0]}`,
          detail: ["위원회 대안의 처리결과가 공식 자료에서 확인되었습니다."]
        };
      }
      return {
        state: "pending",
        label: "위원회 대안 연결정보 확인 중",
        result: "처리결과 확인 중",
        detail: ["국회 대안정보에서 합쳐진 의원안 목록을 확인 중입니다."]
      };
    }
    return {
      state: "pending",
      label: "통합·대안 추적 · 공식 연결정보 확인 중",
      result: "대안반영폐기 여부 확인 중",
      detail: ["의안번호를 기준으로 국회 대안정보와 위원회 심사결과를 확인 중입니다."]
    };
  }

  function ensureAlternativeTrackingData() {
    const existing = new Set(state.data.map(billNumber).filter(Boolean));
    ALTERNATIVE_TRACKS.forEach(track => {
      [track.alternative, ...track.originals].forEach(item => {
        const number = billNumber(item);
        if (number && !existing.has(number)) {
          state.data.push({ ...item });
          existing.add(number);
        }
      });
    });
  }

  function cleanBillSummary(item) {
    let text = String(item?.summary || "")
      .replace(/창닫기\s*(?:\[\s*\d+\s*\])?/gi, " ")
      .replace(/\[\s*\d{5,}\s*\]/g, " ")
      .replace(/제안이유\s*및\s*주요내용|제안이유|주요내용|의안 상세정보|인쇄/g, " ")
      .replace(/(?:\.{3,}|…+)/g, " ");

    [item?.title, item?.proposer, item?.billNo].filter(Boolean).forEach(value => {
      text = text.split(String(value)).join(" ");
    });

    return text
      .replace(/의안번호\s*\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function finishSummarySentence(sentence) {
    let value = String(sentence || "")
      .replace(/^(이에|그러나|따라서|그런데|이와\s*같이|이러한|또한|하지만|그래서|이와\s*관련(?:해서|하여)?)\s*[,，]?\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!value) return "";
    if (!/[.!?]$/.test(value)) return "";
    return value;
  }

  function shortBillSummary(item, bullets = false) {
    const text = cleanBillSummary(item);
    if (!text || text.includes("확인 중입니다")) {
      return "공식 제안이유 및 주요내용을 확인 중입니다.";
    }

    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(finishSummarySentence)
      .filter(sentence => sentence.length >= 12);

    if (!sentences.length) {
      return "공식 원문에서 완결된 주요내용을 확인 중입니다.";
    }

    const score = (sentence, index) => {
      let value = 0;
      if (/개정|신설|도입|확대|강화|완화|개선|보호|지원|의무|금지|부과|마련/.test(sentence)) value += 4;
      if (/문제|지적|우려|어려|부담|피해|한계|필요/.test(sentence)) value += 2;
      if (sentence.length <= 100) value += 2;
      if (index === 0) value += 1;
      return value;
    };

    const selected = sentences
      .map((sentence, index) => ({ sentence, index, score: score(sentence, index) }))
      .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length || a.index - b.index)
      .slice(0, 2)
      .sort((a, b) => a.index - b.index)
      .map(entry => entry.sentence);

    return selected.map(sentence => bullets ? `• ${sentence}` : sentence).join("\n");
  }

  // 화면, 비교표, 즐겨찾기 및 Word 출력이 모두 같은 짧은 완결형 요약을 사용한다.
  summarizeForComparison = function (item) {
    const summary = shortBillSummary(item, true);
    const status = trackingStatus(item);
    if (status.state === "pending") return summary;
    const relation = status.state === "alternative" && status.track
        ? `• 통합·대안: 의원안 ${status.track.originals.map(billNumber).filter(Boolean).join("·") || `${status.track.originals.length}건`}을 반영한 위원회 대안입니다.`
      : status.state === "discarded" && status.track
        ? `• 통합·대안: 대안반영폐기 후 ${status.track.alternativeNo ? `위원회 대안 ${status.track.alternativeNo}` : "연결 위원회 대안"}에 통합되었습니다. 주요 연계내용은 ${status.detail[0]}입니다.`
        : `• 통합·대안: ${status.label}입니다.`;
    return `${summary}\n${relation}`;
  };
  summarizeForReport = function (item) {
    return shortBillSummary(item, true);
  };

  const originalRenderCards = renderCards;
  renderCards = function (items) {
    originalRenderCards(items);
    document.querySelectorAll("#billList .bill-card").forEach((card, index) => {
      const summary = card.querySelector(".summary");
      if (summary && items[index]) summary.textContent = shortBillSummary(items[index]);
      const trackBox = items[index] ? alternativeTrackingMarkup(items[index]) : "";
      if (trackBox) card.querySelector(".card-footer")?.insertAdjacentHTML("beforebegin", trackBox);
    });
  };

  function alternativeTrackingMarkup(item) {
    const track = alternativeTrackFor(item);
    if (!track) return "";
    const number = billNumber(item);
    if (number !== track.alternativeNo) {
      const alternative = track.alternative;
      return `<details class="alternative-trace-box">
        <summary>통합·대안 추적 <strong>대안 ${escapeHtml(track.alternativeNo)}에 통합</strong></summary>
        <div class="alternative-trace-target">
          <span>처리결과</span><b>대안반영폐기</b>
          <button type="button" data-track-search="${escapeHtml(track.alternativeNo)}">대안 ${escapeHtml(track.alternativeNo)} 조회</button>
          <small>${escapeHtml(alternative.change)}</small>
        </div>
      </details>`;
    }

    return `<details class="alternative-trace-box" open>
      <summary>통합·대안 추적 <strong>합쳐진 의원안 ${track.originals.length}건</strong></summary>
      <div class="alternative-trace-result">
        <b>위원회 대안 ${escapeHtml(track.alternativeNo)}</b>
        <span>${escapeHtml(track.alternative.change)}</span>
      </div>
      <ul>${track.originals.map(original => `<li>
        <button type="button" data-track-search="${escapeHtml(billNumber(original))}">${escapeHtml(billNumber(original))}</button>
        <div><b>${escapeHtml(original.proposer)}</b><span>대안반영폐기</span><small>${escapeHtml(original.reflected)}</small></div>
        <a href="${escapeHtml(original.sourceUrl)}" target="_blank" rel="noreferrer">원안 ↗</a>
      </li>`).join("")}</ul>
      <p>※ 공식 대안 연결관계이며, 조문별 실제 반영 정도는 위원회 심사보고서 확인이 필요합니다.</p>
    </details>`;
  }

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
    ensureAlternativeTrackingData();
    const current = originalFilteredItems();
    if (!state.query) return current.filter(matchesStatFilter);

    const query = state.query.toLowerCase();
    const foundKeys = new Set(current.map(itemKey));
    const historicalMatches = state.data.filter(item => {
      if (foundKeys.has(itemKey(item)) || item.month === state.month) return false;
      const haystack = `${item.title || ""} ${item.billNo || ""} ${item.agency || ""} ${item.committee || ""} ${item.proposer || ""} ${item.summary || ""}`.toLowerCase();
      return haystack.includes(query) &&
        (!state.agency || item.agency === state.agency) &&
        (!state.stage || item.stage === state.stage) &&
        (!state.changedOnly || item.changed) &&
        (!state.selectedOnly || state.selectedIds.has(itemKey(item))) &&
        (!state.favoriteOnly || state.favoriteIds.has(itemKey(item)));
    });
    return [...current, ...historicalMatches]
      .filter(matchesStatFilter)
      .sort((a, b) => String(b.changedDate || "").localeCompare(String(a.changedDate || "")));
  };

  window.LegislationDailyUI = {
    STAT_FILTERS,
    billNumber,
    trackingStatus,
    shortBillSummary,
    isDailyChanged
  };
})();

