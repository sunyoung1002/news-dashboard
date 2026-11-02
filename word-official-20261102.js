/* Seven bills checked against the official lawmaking portal on 2026-11-02.
 * Effects are reasoned forecasts, not text quoted from an official review.
 * Match bill number, full title and proposal date before using an entry.
 */
(function (W) {
  "use strict";
  const tax = "조세특례제한법 일부개정법률안";
  const entries = {
    "2200178": ["남녀고용평등과 일·가정 양립 지원에 관한 법률 일부개정법률안", "2024-06-05",
      ["출산휴가 시 육아휴직 신청을 함께 인정하고,", "연기·미사용은 근로자가 선택하도록 함."],
      ["육아휴직", "선택"], ["육아휴직 접근성 확대,", "대체인력 확보 부담."]],
    "2200122": ["상속세 및 증여세법 일부개정법률안", "2024-06-04",
      ["도심융합특구 중소기업 가업상속 공제한도를", "없애고 특구 내 사업유지 사후관리를 둠."],
      ["도심융합특구", "공제한도"], ["지역기업 승계 촉진,", "고액상속 감세 편중."]],
    "2200015": [tax, "2024-05-30",
      ["폐광지역 지정면세점 판매물품의", "부가가치세 등 간접세를 면제함."],
      ["지정면세점", "간접세"], ["폐광지역 관광 촉진,", "기존 상점 매출 분산."]],
    "2200035": [tax, "2024-05-30",
      ["정비사업으로 1주택을 2주택으로 받은 경우,", "1주택 양도 시 양도세 비과세 특례를 둠."],
      ["양도세", "비과세"], ["정비주택 처분 촉진,", "다주택 감세 형평 쟁점."]],
    "2200125": [tax, "2024-06-04",
      ["우주산업 투자진흥지구 기업의 법인세·소득세를", "첫 3년 100%, 다음 2년 50% 감면함."],
      ["투자진흥지구", "법인세·소득세"], ["우주산업 투자 유인,", "특정업종 지원 편중."]],
    "2200126": [tax, "2024-06-04",
      ["특구 조성 후 5년 내 창업·사업장 신설 기업의", "도심융합특구 사업 법인세·소득세를 감면함."],
      ["창업", "법인세·소득세"], ["특구 창업·고용 촉진,", "특구 밖 기업 역차별."]],
    "2200133": [tax, "2024-06-05",
      ["이동통신 사용료를 신용카드 소득공제에 넣고,", "근로자 연말정산 시 연 100만원 한도를 둠."],
      ["이동통신", "소득공제"], ["가계 통신비 경감,", "저소득층 공제혜택 제한."]]
  };
  W.reviewedWordSummaries = Object.assign(W.reviewedWordSummaries || {}, entries);
  W.officialWordSources = Object.fromEntries(Object.keys(entries).map(number => [number, {
    url: `https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/${number}/detailRP`,
    checkedAt: "2026-11-02", source: "법제처 국민참여입법센터 국회입법현황",
    effectsAreForecasts: true
  }]));
})(window.LegislationWordParts = window.LegislationWordParts || {});
