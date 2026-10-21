/* Word table format: title / bill number / proposer on separate lines. */
(function () {
  "use strict";

  function billInfoMarkup(item) {
    return `<div class="bill-title">${escapeHtml(item.title || "법안명 확인 중")}</div>
      <div class="bill-number">${escapeHtml(item.billNo || "의안번호 확인 중")}</div>
      <div class="bill-proposer">${escapeHtml(item.proposer || "발의자 확인 중")}</div>`;
  }

  function referenceDate(item) {
    return item.stageDate || item.dailyChangedDate || item.changedDate || "-";
  }

  function sourceSummary(item) {
    return window.LegislationDailyUI.shortBillSummary(item).replace(/\s+/g, " ").trim();
  }

  function favoriteSummary(item) {
    const text = sourceSummary(item).replace(/\(안[^)]*\)/g, "").trim();
    if (text.length <= 90) return text;
    const keywords = coreKeywords(item);
    // 긴 문장을 중간에서 잘라 생략하지 않고, 원문에 포함된 핵심어로 한 문장을 만든다.
    return keywords.length ? `${keywords.slice(0, 2).join("·")} 관련 규정을 정비함.` : "핵심 개정 내용 확인 필요.";
  }

  function coreKeywords(item) {
    const text = sourceSummary(item);
    const terms = ["보험료 분할납부", "분할납부", "납부기한", "고용보험료", "실업급여", "고용보험", "보험료", "상수원보호구역", "변경신청", "지방자치단체", "지속가능성", "손해배상", "자료제출명령", "비밀유지명령", "정보공시", "정보공개", "공시", "제3자검증", "영업비밀", "기술유용", "하도급", "납품대금", "과징금", "집단소송", "소비자보호", "안전", "탄소중립", "온실가스", "청년고용", "세액공제", "상속세", "증여세", "기업지배구조", "이사", "의무", "지원", "제재"];
    const found = terms.filter(term => text.includes(term)).filter((term, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.length > term.length && other.includes(term)));
    if (found.length) return found.slice(0, 3);
    if (/확인 중/.test(text)) return [];
    return [...billTokens({ title: "", summary: text })].filter(term => term.length <= 12 && !/\d/.test(term) && !/^(매년|매월|때에는|경우에는|이러한|이유로|현행|현행법|제기됨|있음)$/.test(term) && !/(것임|내용임|함으로써|하려는|있으며|하고자|필요성|한다는)$/.test(term)).slice(0, 3);
  }

  function effectsMarkup(item) {
    if (item.positiveEffects || item.negativeEffects) return `<b>긍정</b>: ${escapeHtml(item.positiveEffects || "추가 검토 필요")}<br><b>부정</b>: ${escapeHtml(item.negativeEffects || "추가 검토 필요")}`;
    const text = sourceSummary(item);
    // 개정 내용에 드러난 수단에 한해서 예상 효과를 설명한다. 배경의 문제점을 효과로 단정하지 않는다.
    const rules = [
      [/보험료.*(?:반기|분할)|(?:반기|분할).*보험료/, "사업주의 납부 부담·자금 압박 완화 기대", "보험 재정의 현금 유입 지연 가능"],
      [/변경.*신청/, "현장 수요를 반영한 신청·검토 기회 확대 가능", "검토 업무·기관 간 조정 부담 증가 가능"],
      [/세액공제|소득공제|세금.*감면|세제.*지원/, "대상자의 세 부담 경감·투자 유인 확대 가능", "세수 감소·지원 대상 간 형평성 쟁점 가능"],
      [/공시|정보공개|정보.*공개/, "이해관계자의 정보 접근·비교 가능성 향상 기대", "작성·검증 비용과 영업정보 노출 부담 가능"],
      [/손해배상|자료제출명령|집단소송/, "피해자의 입증·권리구제 실효성 향상 기대", "자료 제출·소송 대응 비용 증가 가능"],
      [/과징금|처벌|벌금|제재.*강화/, "위법행위 억제·피해 예방 효과 기대", "제재 대상의 준수·분쟁 대응 부담 증가 가능"],
      [/안전.*강화|안전.*의무|재해.*예방/, "사고 예방·근로자 안전 개선 기대", "안전설비·관리 인력 비용 증가 가능"],
      [/지원.*확대|지원.*신설|지급|보조금/, "지원 대상의 경제적 부담 완화 기대", "재정 지출·지원 형평성 쟁점 가능"],
      [/의무.*신설|의무화|제출하도록|보고하도록/, "의무 이행의 책임성·정책 집행력 향상 기대", "대상 기관·기업의 이행 비용 증가 가능"],
      [/규제.*완화|폐지|면제/, "대상자의 규제 준수 부담 완화 기대", "보호 장치 축소·감독 공백 여부 검토 필요"]
    ];
    const rule = rules.find(([pattern]) => pattern.test(text));
    return `<b>긍정</b>: ${escapeHtml(rule?.[1] || "구체적 효과 추가 검토 필요")}<br><b>부정</b>: ${escapeHtml(rule?.[2] || "이행 비용·부작용 추가 검토 필요")}`;
  }

  function resultMarkup(item) {
    const result = String(item.processingResult || item.change || "").match(/대안반영폐기|원안가결|병합심사/);
    if (!result) return "";
    const no = String(item.alternativeBillNo || item.absorbedBy || "").match(/\d{7}/)?.[0];
    return `<div class="reference-date">※ ${escapeHtml(result[0])}${no ? `<br>대안 의안번호: ${no}` : ""}</div>`;
  }

  function portraitProgressMarkup(item) {
    const current = ["접수", "소관위", "법사위", "본회의", "공포·시행"].indexOf(item.stage);
    return `<div class="portrait-progress">${["접수", "소관위", "법사위", "본회의", "공포·시행"].map((stage, index) => `<div style="color:${index === current ? "#a34b00" : index < current ? "#175cbd" : "#64748b"}">${index === current ? "●" : index < current ? "■" : "□"} ${stage}${index === current ? " (현재)" : ""}</div>`).join("")}</div>`;
  }

  function stageDateMarkup(item, favoriteReport) {
    if (!favoriteReport) return `기준일 ${escapeHtml(referenceDate(item))}`;
    const stageDate = window.MonthlyBillUI.validDate(item.stageDate);
    const current = item.stage !== "소관위" && stageDate ? `${escapeHtml(item.stage || "진행단계")} · ${stageDate}<br>` : "";
    return current + window.MonthlyBillUI.committeeDatesMarkup(item).replace(/<\/span><span>/g, "<br>").replace(/<\/?span>/g, "");
  }

  function progressMarkup(item) {
    const stages = ["접수", "소관위", "법사위", "본회의", "공포·시행"];
    const current = Math.max(0, stages.indexOf(item.stage));
    const stateClass = index => index < current ? "past" : index === current ? "current" : "waiting";
    return `<table class="word-progress" role="presentation">
      <tr class="progress-bars">${stages.map((_, index) =>
        `<td class="${stateClass(index)}">&nbsp;</td>`).join("")}</tr>
      <tr class="progress-labels">${stages.map((stage, index) =>
        `<td class="${stateClass(index)}">${stage}</td>`).join("")}</tr>
    </table>`;
  }

  downloadItemsWordReport = function (items, reportTitle, filename, customFilterLabel = "", groupByAgency = false) {
    if (!items.length) {
      window.alert("Word 보고서로 출력할 법안이 없습니다.");
      return;
    }

    const favoriteReport = /주요법안현황|즐겨찾기/.test(`${reportTitle} ${customFilterLabel}`);
    if (favoriteReport) items = items.map(item => window.MonthlyBillUI.latestItem(itemKey(item)) || item);
    const reportItems = groupByAgency ? [...items].sort((a, b) => {
      const agencyOrder = String(a.agency || "기타").localeCompare(String(b.agency || "기타"), "ko");
      return agencyOrder || String(a.title || "").localeCompare(String(b.title || ""), "ko");
    }) : items;
    let previousAgency = "";
    let agencyNumber = 0;
    const columnCount = favoriteReport ? 6 : 5;
    const rows = reportItems.map((item, index) => {
      const agency = item.agency || "기타";
      const agencyRow = groupByAgency && agency !== previousAgency
        ? `<tr class="agency-group"><td colspan="${columnCount}">${escapeHtml(agency)}</td></tr>`
        : "";
      if (agency !== previousAgency) agencyNumber = 0;
      agencyNumber += 1;
      previousAgency = agency;
      return `${agencyRow}<tr>
        <td class="number">${groupByAgency ? agencyNumber : index + 1}</td>
        <td class="bill-info" ${favoriteReport ? 'width="22%"' : ""}>${billInfoMarkup(item)}</td>
        <td ${favoriteReport ? 'width="12%"' : ""}>${escapeHtml(agency)}<div class="sub">${escapeHtml(item.committee || "위원회 확인 중")}</div></td>
        <td ${favoriteReport ? 'width="21%"' : ""}>${favoriteReport ? portraitProgressMarkup(item) : progressMarkup(item)}
          <div class="reference-date">${stageDateMarkup(item, favoriteReport)}</div>${favoriteReport ? resultMarkup(item) : ""}</td>
        <td class="summary-cell" ${favoriteReport ? 'width="22%"' : ""}>${escapeHtml(favoriteReport ? favoriteSummary(item) : summarizeForReport(item))}${favoriteReport ? `<div class="sub">핵심어: ${escapeHtml(coreKeywords(item).join(" · ") || "공식 주요내용 확인 중")}</div>` : ""}</td>
        ${favoriteReport ? `<td class="effects-cell" width="18%">${effectsMarkup(item)}</td>` : ""}
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
    const content = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title><style>
        @page WordSection1 { ${favoriteReport ? "size:595.3pt 841.9pt; mso-page-orientation:portrait;" : "size:841.9pt 595.3pt; mso-page-orientation:landscape;"} margin:28.35pt; }
        div.WordSection1 { page:WordSection1; }
        body { font-family:'Malgun Gothic',sans-serif; font-size:8.5pt; color:#172033; }
        h1 { margin:0 0 8pt; text-align:center; font-size:18pt; }
        .meta { margin:0 0 10pt; text-align:center; color:#4b5563; font-size:9pt; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        thead { display:table-header-group; } tr { page-break-inside:avoid; }
        th,td { border:.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:${favoriteReport ? "break-all" : "keep-all"}; overflow-wrap:break-word; }
        th { background:#dbeafe; text-align:center; font-weight:bold; }
        .number { text-align:center; }
        .bill-title { font-weight:bold; color:#172033; }
        .bill-number,.bill-proposer,.sub,.reference-date { display:block; margin-top:4pt; color:#475569; font-size:8pt; }
        .summary-cell { line-height:1.5; white-space:pre-line; }
        .portrait-progress { font-size:8pt; line-height:1.5; }
        .effects-cell { font-size:8pt; }
        .word-progress { width:100%; border:0; border-collapse:separate; border-spacing:3pt 0; table-layout:fixed; }
        .word-progress td { border:0; text-align:center; }
        .word-progress .progress-bars td { height:4pt; padding:0; background:#e5edf5; font-size:1pt; line-height:1pt; }
        .word-progress .progress-bars td.past { background:#2878ee; }
        .word-progress .progress-bars td.current { background:#ed7800; }
        .word-progress .progress-labels td { padding:4pt 0 0; color:#9aafc5; font-size:6.5pt; white-space:nowrap; }
        .word-progress .progress-labels td.past,.word-progress .progress-labels td.current { color:#334155; font-weight:bold; }
        .agency-group td { padding:5pt 7pt; background:#eff6ff; color:#163f70; font-size:10pt; font-weight:bold; }
        .note { margin-top:7pt; color:#64748b; font-size:7.5pt; }
      </style></head><body><div class="WordSection1">
        <h1>${escapeHtml(reportTitle)}</h1>
        <p class="meta">조회조건: ${escapeHtml(filters)} · 총 ${items.length.toLocaleString()}건 · 작성일 ${escapeHtml(generatedAt)}</p>
        <table ${favoriteReport ? 'border="1" cellspacing="0" cellpadding="5" width="100%"' : ""}>${favoriteReport ? `<colgroup><col style="width:5%"><col style="width:22%"><col style="width:12%"><col style="width:21%"><col style="width:22%"><col style="width:18%"></colgroup>` : `<colgroup><col style="width:3.5%"><col style="width:18.5%"><col style="width:13.5%"><col style="width:18%"><col style="width:46.5%"></colgroup>`}
          <thead><tr><th>번호</th><th>${favoriteReport ? "법안정보" : "법안 정보"}</th><th>${favoriteReport ? "소관기관" : "소관 기관"}</th><th>${favoriteReport ? "진행현황" : "진행 현황"}</th><th>${favoriteReport ? "주요내용" : "주요내용 요약"}</th>${favoriteReport ? "<th>기타 영향 및 효과</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody></table>
        <p class="note">${favoriteReport ? "※ 주요내용은 한 문장으로 요약했습니다. 영향·효과는 주요내용에 근거한 예상이며 공식 영향평가가 아닙니다." : "※ 주요내용은 개정 취지와 핵심 내용을 중심으로 완결된 문장으로 정리했습니다."}</p>
      </div></body></html>`;
    createWordDownload(content, filename);
  };

  downloadComparisonWordReport = function () {
    const items = selectedComparisonItems();
    if (items.length < 2) {
      window.alert("비교표를 출력하려면 법안을 2개 이상 선택해 주세요.");
      return;
    }
    const common = commonBillKeywords(items);
    const comparisonRows = [
      ["법안 정보", item => billInfoMarkup(item)],
      ["소관기관·위원회", item => `${escapeHtml(item.agency || "-")}<br>${escapeHtml(item.committee || "-")}`],
      ["진행현황", item => progressMarkup(item)],
      ["기준일", item => escapeHtml(referenceDate(item))],
      ["주요 내용 요약", item => escapeHtml(summarizeForReport(item)).replace(/\n/g, "<br>")],
      ["차별화 핵심어", item => distinctiveKeywords(item, items).map(escapeHtml).join(", ") || "-"]
    ];
    const rows = comparisonRows.map(([label, renderCell]) =>
      `<tr><th>${label}</th>${items.map(item => `<td>${renderCell(item)}</td>`).join("")}</tr>`
    ).join("");
    const generatedAt = new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
    const content = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><style>
        @page WordSection1 { size:841.9pt 595.3pt; mso-page-orientation:landscape; margin:28.35pt; }
        div.WordSection1 { page:WordSection1; }
        body { font-family:'Malgun Gothic',sans-serif; font-size:9pt; color:#172033; }
        h1 { text-align:center; font-size:18pt; margin:0 0 8pt; }
        .meta { text-align:center; color:#475569; margin:0 0 8pt; }
        .common { padding:7pt; margin-bottom:8pt; background:#eff6ff; border:.75pt solid #bfdbfe; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        th,td { border:.75pt solid #64748b; padding:5pt; vertical-align:top; line-height:1.45; word-break:keep-all; }
        thead th { background:#dbeafe; text-align:center; } tbody th { width:11%; background:#f1f5f9; text-align:left; }
        .bill-title { font-weight:bold; } .bill-number,.bill-proposer { display:block; margin-top:4pt; color:#475569; font-size:8pt; }
        .word-progress { width:100%; border:0; border-collapse:separate; border-spacing:3pt 0; table-layout:fixed; }
        .word-progress td { border:0; text-align:center; }
        .word-progress .progress-bars td { height:4pt; padding:0; background:#e5edf5; font-size:1pt; line-height:1pt; }
        .word-progress .progress-bars td.past { background:#2878ee; }
        .word-progress .progress-bars td.current { background:#ed7800; }
        .word-progress .progress-labels td { padding:4pt 0 0; color:#9aafc5; font-size:6.5pt; white-space:nowrap; }
        .word-progress .progress-labels td.past,.word-progress .progress-labels td.current { color:#334155; font-weight:bold; }
      </style></head><body><div class="WordSection1">
        <h1>${formatMonth(state.month)} 유사·선택 법안 비교 보고서</h1>
        <p class="meta">비교 법안 ${items.length}건 · 작성일 ${escapeHtml(generatedAt)}</p>
        <div class="common"><strong>공통 핵심어:</strong> ${common.length ? common.map(escapeHtml).join(", ") : "뚜렷한 공통 핵심어 없음"}</div>
        <table><thead><tr><th>비교항목</th>${items.map((_, index) => `<th>법안 ${index + 1}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      </div></body></html>`;
    createWordDownload(content, `${state.month}_법안비교보고서.doc`);
  };

  document.addEventListener("click", event => {
    if (!event.target.closest("#downloadComparison")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadComparisonWordReport();
  }, true);
})();
