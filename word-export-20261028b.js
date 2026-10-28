(function (W) {
"use strict";
const { sourceSummary, coreKeywords, effectsMarkup } = W;
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
if (!summary) return ["공식 원문에 따른 개정내용의", "추가 요약·대조가 필요함."];
if (textUnits(summary) <= limit) return [summary];
let width = 0, cut = 0;
for (const char of summary) {
if (width + textUnits(char) > limit) break;
width += textUnits(char); cut += char.length;
}
const space = summary.lastIndexOf(" ", cut);
if (space > 0 && textUnits(summary.slice(space + 1)) <= limit) cut = space;
return [summary.slice(0, cut).trim(), summary.slice(cut).trim()].filter(Boolean);
}
function compactDate(item) {
const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const related = window.MonthlyBillUI?.reviews?.(item) || [];
const dates = [...related.map(row => row.presentDate), item.subcommitteePresentDate, item.committeePresentDate].filter(valid).sort();
if (dates.length) return `상정일: ${dates[dates.length - 1]}`;
return valid(item.committeeDate) ? `회부일: ${item.committeeDate}` : "";
}
function compactState(item) {
const ended = String(item.processingResult || item.change || "").match(/대안반영폐기|철회|부결|폐기/);
const status = ended?.[0] || item.stage || "확인 중";
const committee = window.MonthlyBillUI?.committeeLabel?.(item);
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

(function (W) {
"use strict";
const { textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects } = W;
function compactRow(item, number, font, groupByAgency = false) {
const columns = [20, 146, 102, 184, 103];
const line = font * 1.25;
const summary = compactSummaryLines(item, Math.floor((columns[3] - 4) / font));
const proposer = String(item.proposer || "발의자 확인 중").replace(/\s*(?:등|외)\s*[\d,]+\s*인/g, "").replace(/의원(?=\s*(?:[·ㆍ,]|$))/g, "").replace(/\s+/g, " ").trim();
const numberText = String(item.billNo || "").match(/\d{7}/)?.[0] || "확인 중";
const info = [compactTitle(item), `${proposer}(의안번호: ${numberText})`];
const status = [...(groupByAgency ? [] : [item.agency || "기타"]), compactState(item), compactDate(item)].filter(Boolean);
const alternative = String(item.alternativeBillNo || item.absorbedBy || "").match(/\d{7}/)?.[0];
if (alternative) status.push(`대안 ${alternative}`);
const values = [[String(number)], info, status, summary, compactEffects(item)];
const heights = values.map((parts, index) => parts.reduce((count, part) => count + Math.max(1, Math.ceil(textUnits(part) * (index === 1 && part === parts[0] ? 9 : font) / (columns[index] - 6))), 0));
const height = Math.max(...heights) * line + 3;
return { item, values, height };
}

function compactPages(items, groupByAgency, font) {
const pages = [];
let page = [], height = 0, previous = "", number = 0;
items.forEach(item => {
const agency = item.agency || "기타";
if (agency !== previous) number = 0;
number += 1;
const row = compactRow(item, groupByAgency ? number : pages.reduce((n, rows) => n + rows.filter(entry => entry.item).length, 0) + page.filter(entry => entry.item).length + 1, font, groupByAgency);
let heading = groupByAgency && (agency !== previous || !page.length);
if (page.length && height + row.height + (heading ? 12 : 0) > 738) {
pages.push(page); page = []; height = 0; heading = groupByAgency;
}
if (heading) {
page.push({ agency });
height += 12;
}
page.push(row); height += row.height; previous = agency;
});
if (page.length) pages.push(page);
return pages;
}
function compactDocx(pages, title, total, font, part, parts) {
const columns = [400, 2920, 2040, 3680, 2060];
const generated = new Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
const run = (value, size = font, bold = false, color = "000000") => `<w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${escapeHtml(value)}</w:t></w:r>`;
const summaryKeywords = text => {
const choices = ["납품대금 연동", "행정·재정 지원", "분쟁조정원", "피해구제", "징벌배상", "손해배상", "의무공개매수", "지속가능성", "정보공시", "제3자검증", "전자주주명부", "주주제안권", "주주제안", "집단소송", "증거개시", "진술녹취", "개인정보법", "담합", "과징금", "납품대금", "하도급대금", "지급기한", "청년고용", "안전·보건조치", "자료제출명령", "문서제출", "비밀유지명령", "물적분할", "우선배정", "신주", "공시", "감액", "공개매수", "계약", "공고", "지원", "의무", "배당", "주주", "상속", "증여세", "평가액", "규정", "기한", "처벌", "행정조사기본법", "상수원보호구역"];
const hits = choices.filter(term => text.includes(term));
const distinct = hits.filter(term => !hits.some(other => other !== term && other.includes(term)));
if (distinct.length) return distinct.slice(0, 2);
return (text.match(/[가-힣]{2,8}/g) || []).filter(term => !/^(?:하도록|위하여|있도록|원칙적으로|추가|공식|원문)/.test(term)).slice(0,2);
};
const coloredRuns = (value, item) => {
const text = String(value), terms = (item?.wordKeywords || []).filter(term => text.includes(term));
let xml = "", position = 0;
while (position < text.length) {
const hits = terms.map(term => ({term, at:text.indexOf(term, position)})).filter(hit => hit.at >= 0).sort((a,b) => a.at - b.at || b.term.length - a.term.length);
const next = hits[0];
if (!next) { xml += run(text.slice(position), 8); break; }
if (next.at > position) xml += run(text.slice(position, next.at), 8);
xml += run(next.term, 8, false, "1565C0");
position = next.at + next.term.length;
}
return xml || run("", 8);
};
const para = (value, options = {}) => `<w:p><w:pPr><w:pStyle w:val="Normal"/>${options.break ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${options.align || 'left'}"/>${options.keep ? '<w:keepNext/>' : ''}</w:pPr>${options.keywordItem ? coloredRuns(value, options.keywordItem) : run(value, options.size || font, options.bold)}</w:p>`;
const cell = (values, width, index, heading = false, item = null) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/>${heading ? '<w:shd w:fill="DBEAFE"/>' : ''}</w:tcPr>${values.map((value, i) => para(value, { size:heading || (index === 1 && i === 0) ? 9 : 8, bold:heading || (index === 1 && i === 0), align:heading || index === 0 ? 'center' : 'left', keywordItem:!heading && index === 3 ? {...item, wordKeywords:summaryKeywords(values.join(" "))} : null })).join('')}</w:tc>`;
const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="11100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="8190A3"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="5" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="5" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${columns.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${['','법안정보','소관기관/진행현황','주요내용','기타 영향 및 효과'].map((value, index) => cell([value], columns[index], index, true)).join('')}</w:tr>${rows.map(row => row.item ? `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.values.map((values, index) => cell(values, columns[index], index, false, row.item)).join('')}</w:tr>` : `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="11100" w:type="dxa"/><w:gridSpan w:val="5"/><w:shd w:fill="EFF6FF"/></w:tcPr>${para(row.agency, {size:9,bold:true,keep:true})}</w:tc></w:tr>`).join('')}</w:tbl>`;
let lastAgency = "";
const continuousRows = pages.flat().filter(row => {
if (row.item) return true;
if (row.agency === lastAgency) return false;
lastAgency = row.agency;
return true;
});
const body = para(title, {size:13,bold:true,align:'center',keep:true}) + para(`총 ${total}건 · 작성일 ${generated}`, {size:7,align:'right',keep:true}) + table(continuousRows) + para('※ 영향·효과는 법안 내용에 근거한 예상임.', {size:6});
const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
return [
{name:'[Content_Types].xml',content:xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
{name:'_rels/.rels',content:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
{name:'word/_rels/document.xml.rels',content:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
{name:'word/styles.xml',content:xml+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:color w:val="000000"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style></w:styles>'},
{name:'word/document.xml',content:xml+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="360" w:right="400" w:bottom="360" w:left="400" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`}
];
}
Object.assign(W, { compactRow, compactPages, compactDocx });
})(window.LegislationWordParts = window.LegislationWordParts || {});

(function(W){
"use strict";
const previous = downloadItemsWordReport;
function exportFavorites(items,title,filename,groupByAgency){
if(!items.length){window.alert("Word 보고서로 출력할 법안이 없습니다.");return;}
const rows=items.map(item=>window.MonthlyBillUI?.latestItem?.(itemKey(item))||item);
const sorted=groupByAgency?[...rows].sort((a,b)=>String(a.agency||"기타").localeCompare(String(b.agency||"기타"),"ko")||String(a.title||"").localeCompare(String(b.title||""),"ko")):rows;
W.compactZip(W.compactDocx(W.compactPages(sorted,groupByAgency,8),title,rows.length,8,1,1),filename.replace(/\.docx?$/i,"")+".docx");
}
W.downloadCompactFavorites=exportFavorites;
downloadItemsWordReport=function(items,title,filename,filter="",group=false){
if(/주요법안현황|즐겨찾기/.test(`${title} ${filter}`))return exportFavorites(items,title,filename,group);
return previous(items,title,filename,filter,group);
};
if(Object.keys(W.reviewedWordSummaries||{}).length!==95||typeof W.compactZip!=="function")throw new Error("Word 필수 파일 확인 필요");
W.stableRelease="20261028b";
})(window.LegislationWordParts);