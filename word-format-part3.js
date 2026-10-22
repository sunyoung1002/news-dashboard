/* Word export part 3/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup, textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects } = W;
  function compactRow(item, number, font, groupByAgency = false) {
    const columns = [20, 146, 102, 184, 103];
    const line = font + 1.5;
    const summary = compactSummaryLines(item, Math.floor((columns[3] - 6) / font) - 1);
    const proposer = String(item.proposer || "발의자 확인 중").replace(/\s*(?:등|외)\s*[\d,]+\s*인/g, "").replace(/의원(?=\s*(?:[·ㆍ,]|$))/g, "").replace(/\s+/g, " ").trim();
    const numberText = String(item.billNo || "").match(/\d{7}/)?.[0] || "확인 중";
    const info = [compactTitle(item), `${proposer}(의안번호: ${numberText})`];
    const status = [...(groupByAgency ? [] : [item.agency || "기타"]), compactState(item), compactDate(item)].filter(Boolean);
    const alternative = String(item.alternativeBillNo || item.absorbedBy || "").match(/\d{7}/)?.[0];
    if (alternative) status.push(`대안 ${alternative}`);
    const values = [[String(number)], info, status, summary, compactEffects(item)];
    const heights = values.map((parts, index) => parts.reduce((count, part) => count + Math.max(1, Math.ceil(textUnits(part) * font / (columns[index] - 6))), 0));
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
    const run = (value, size = font, bold = false) => `<w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${escapeHtml(value)}</w:t></w:r>`;
    const para = (value, options = {}) => `<w:p><w:pPr>${options.break ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="${Math.round((options.line || font + 1.5) * 20)}" w:lineRule="exact"/><w:jc w:val="${options.align || 'left'}"/>${options.keep ? '<w:keepNext/>' : ''}</w:pPr>${run(value, options.size || font, options.bold)}</w:p>`;
    const cell = (values, width, index, heading = false) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/>${heading ? '<w:shd w:fill="DBEAFE"/>' : ''}</w:tcPr>${values.map((value, i) => para(value, { bold: heading || (index === 1 && i === 0), align: heading || index === 0 ? 'center' : 'left' })).join('')}</w:tc>`;
    const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="11100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="8190A3"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="5" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="5" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${columns.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${['번호','법안정보','소관기관/진행현황','주요내용','기타 영향 및 효과'].map((value, index) => cell([value], columns[index], index, true)).join('')}</w:tr>${rows.map(row => row.item ? `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.values.map((values, index) => cell(values, columns[index], index)).join('')}</w:tr>` : `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="11100" w:type="dxa"/><w:gridSpan w:val="5"/><w:shd w:fill="EFF6FF"/></w:tcPr>${para(row.agency, {bold:true,keep:true})}</w:tc></w:tr>`).join('')}</w:tbl>`;
    const body = pages.map((rows, index) => para(title, { size:13, line:16, bold:true, align:'center', break:index > 0, keep:true }) + para(`총 ${total}건${parts > 1 ? ` · ${part}/${parts}권` : ''} · ${index + 1}/${pages.length}쪽 · 작성일 ${generated}`, { size:7, line:10, align:'right', keep:true }) + table(rows) + para('※ 영향·효과는 법안 내용에 근거한 예상임.', {size:6,line:8})).join('');
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return [
      {name:'[Content_Types].xml',content:xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
      {name:'_rels/.rels',content:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name:'word/document.xml',content:xml+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="360" w:right="400" w:bottom="360" w:left="400" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`}
    ];
  }
  Object.assign(W, { compactRow, compactPages, compactDocx });
})(window.LegislationWordParts = window.LegislationWordParts || {});
