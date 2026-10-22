/* Word export part 2/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup } = W;
  function textUnits(text) {
    return [...String(text || "")].reduce((n, c) => n + (/\s/.test(c) ? .32 : /[a-z0-9.,:;()\-]/i.test(c) ? .56 : 1), 0);
  }
  function compactTitle(item) {
    return String(item.title || "법안명 확인 중").replace(/\s*일부\s*개정\s*법률안/g, "").replace(/\s+/g, " ").trim();
  }
  function compactSummaryLines(item, limit) {
    const terms = coreKeywords(item).filter(term => textUnits(term) <= limit - 6);
    let summary = favoriteSummary(item);
    if (textUnits(summary) > limit) {
      let topic = terms.slice(0, 2).join("·");
      if (textUnits(topic + " 규정 정비함.") > limit) topic = terms[0] || "";
      summary = topic ? `${topic} 규정 정비함.` : "주요내용 확인 중.";
    }
    const selected = [];
    terms.forEach(term => {
      if (selected.length < 3 && textUnits("핵심어: " + [...selected, term].join("·")) <= limit) selected.push(term);
    });
    return [summary, `핵심어: ${selected.join("·") || "확인 중"}`];
  }
  function compactDate(item) {
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    const related = window.MonthlyBillUI?.reviews(item) || [];
    const dates = [...related.map(row => row.presentDate), item.subcommitteePresentDate, item.committeePresentDate].filter(valid).sort();
    if (dates.length) return `상정일: ${dates[dates.length - 1]}`;
    return valid(item.committeeDate) ? `회부일: ${item.committeeDate}` : "";
  }
  function compactState(item) {
    const ended = String(item.processingResult || item.change || "").match(/대안반영폐기|철회|부결|폐기/);
    const status = ended?.[0] || item.stage || "확인 중";
    const committee = window.MonthlyBillUI?.committeeLabel(item);
    const name = committee && committee !== "기타 및 미정" && item.agency !== item.committee ? `${committee} · ` : "";
    return name + status;
  }
  function compactEffects(item) {
    const replacements = [
      ["사업주의 납부 부담·자금 압박 완화 기대", "납부부담 완화 기대"], ["보험 재정의 현금 유입 지연 가능", "보험재정 지연 우려"],
      ["현장 수요를 반영한 신청·검토 기회 확대 가능", "현장수요 반영 기대"], ["검토 업무·기관 간 조정 부담 증가 가능", "검토·조정 부담 우려"],
      ["대상자의 세 부담 경감·투자 유인 확대 가능", "세부담 완화 기대"], ["세수 감소·지원 대상 간 형평성 쟁점 가능", "세수·형평성 우려"],
      ["이해관계자의 정보 접근·비교 가능성 향상 기대", "정보접근 개선 기대"], ["작성·검증 비용과 영업정보 노출 부담 가능", "비용·정보노출 우려"],
      ["피해자의 입증·권리구제 실효성 향상 기대", "피해구제 개선 기대"], ["자료 제출·소송 대응 비용 증가 가능", "소송비 증가 우려"],
      ["위법행위 억제·피해 예방 효과 기대", "위법·피해 예방 기대"], ["제재 대상의 준수·분쟁 대응 부담 증가 가능", "준수비용 증가 우려"],
      ["사고 예방·근로자 안전 개선 기대", "안전 개선 기대"], ["안전설비·관리 인력 비용 증가 가능", "안전비용 증가 우려"],
      ["지원 대상의 경제적 부담 완화 기대", "경제부담 완화 기대"], ["재정 지출·지원 형평성 쟁점 가능", "재정·형평성 우려"],
      ["의무 이행의 책임성·정책 집행력 향상 기대", "책임성 개선 기대"], ["대상 기관·기업의 이행 비용 증가 가능", "이행비용 증가 우려"],
      ["대상자의 규제 준수 부담 완화 기대", "규제부담 완화 기대"], ["보호 장치 축소·감독 공백 여부 검토 필요", "감독공백 검토 필요"],
      ["구체적 효과 추가 검토 필요", "효과 검토 필요"], ["이행 비용·부작용 추가 검토 필요", "부작용 검토 필요"]
    ];
    let text = effectsMarkup(item).replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "");
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    replacements.forEach(([from, to]) => { text = text.split(from).join(to); });
    return text.split("\n").filter(Boolean);
  }
  Object.assign(W, { textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects });
})(window.LegislationWordParts = window.LegislationWordParts || {});
