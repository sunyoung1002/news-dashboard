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
    const number = String(item.billNo || "").match(/\d{7}/)?.[0];
    const verified = W.reviewedWordSummaries?.[number];
    const normalize = value => String(value || "").replace(/[\s·ㆍ]/g, "");
    if (verified && normalize(item.title) === normalize(verified[0]) &&
        (!item.proposeDate || item.proposeDate === verified[1])) {
      return [...verified[2]];
    }
    const budget = limit * 2 - 1;
    // Prefer stored official content over the screen's shortened summary.
    const original = String(item.summary || "").replace(/제안이유\s*및\s*주요내용/g, "").replace(/\(안[^)]*\)/g, "").trim();
    if (!original || /미수집|확인\s*중|원문\s*확인\s*필요/.test(original)) return ["공식 주요내용 확인 필요."];
    const sentences = original.split(/(?<=[.!?])\s+|[\r\n]+/).map(text => text
      .replace(/^\s*(?:[가-힣]|\d+)[.)]\s*/, "")
      .replace(/^(?:이에|그러나|따라서|그런데|또한|하지만|그래서|이미|이와\s*같이|이와\s*관련해서)\s*[,，]?\s*/, "")
      .replace(/하기\s*위하여/g, "위해").replace(/하고자\s*하는\s*것임/g, "하고자 함")
      .replace(/하려는\s*것임/g, "하려는 내용임").replace(/\s+/g, " ").trim())
      .filter(text => text.length >= 12 && /개정|신설|도입|확대|강화|완화|개선|보호|지원|의무|금지|마련|규정|하도록|기간|기한/.test(text) &&
        !/^(?:현행|최근|지난)/.test(text) && /(?:[.!?]|함|됨|임|음)$/.test(text));
    const candidates = sentences.sort((a,b) => Number(/하도록|하고자|하려는/.test(b)) - Number(/하도록|하고자|하려는/.test(a)));
    const summary = candidates.find(text => textUnits(text) <= budget);
    // Never invent an amendment by joining isolated keywords or clip a condition.
    if (!summary) return ["공식 원문에 따른 개정내용의", "추가 요약·대조가 필요함."];
    if (textUnits(summary) <= limit) return [summary];
    let width = 0, cut = 0;
    for (const char of summary) {
      if (width + textUnits(char) > limit) break;
      width += textUnits(char); cut += char.length;
    }
    // Prefer a word boundary if both resulting lines fit.
    const space = summary.lastIndexOf(" ", cut);
    if (space > 0 && textUnits(summary.slice(space + 1)) <= limit) cut = space;
    return [summary.slice(0, cut).trim(), summary.slice(cut).trim()].filter(Boolean);
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
    const values = text.split("\n").filter(Boolean).map(value => value.replace(/^(?:긍정|부정)\s*:\s*/, "").replace(/[.!?]+$/, "").trim());
    const subject = value => {
      const noun = value.trim(), code = noun.charCodeAt(noun.length - 1);
      const particle = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 ? "이" : "가";
      return noun + particle;
    };
    const clause = (value, continuing) => {
      if (/\s*기대$/.test(value)) return subject(value.replace(/\s*기대$/, "")) + (continuing ? " 기대되며" : " 기대됨");
      if (/\s*우려$/.test(value)) return subject(value.replace(/\s*우려$/, "")) + (continuing ? " 우려되며" : " 우려됨");
      if (/\s*필요$/.test(value)) return subject(value.replace(/\s*필요$/, "")) + (continuing ? " 필요하며" : " 필요함");
      if (/\s*가능$/.test(value)) return subject(value.replace(/\s*가능$/, "")) + (continuing ? " 가능하며" : " 가능함");
      if (continuing) return value.replace(/됨$/, "되며").replace(/함$/, "하며").replace(/임$/, "이며").replace(/다$/, "며");
      return value;
    };
    if (values[0] === "효과 검토 필요" && values[1] === "부작용 검토 필요") return ["기대효과와 부작용에 대한 추가 검토가 필요함."];
    return [values.map((value, index) => clause(value, index < values.length - 1)).join(" ") + "."];
  }
  Object.assign(W, { textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects });
})(window.LegislationWordParts = window.LegislationWordParts || {});
