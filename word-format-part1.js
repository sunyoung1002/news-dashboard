/* Word export part 1/6. Upload all parts before replacing the loader. */
(function (W) {
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

  function stageDateMarkup(item) {
    return `기준일 ${escapeHtml(referenceDate(item))}`;
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

  // 주요법안 Word 전용: 다섯 열, 두 줄 주요내용, 파일당 최대 네 쪽.
  Object.assign(W, { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup });
})(window.LegislationWordParts = window.LegislationWordParts || {});
