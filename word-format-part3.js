/* Word export part 3/6. Upload all parts before replacing the loader. */
(function (W) {
  "use strict";
  const { billInfoMarkup, referenceDate, sourceSummary, favoriteSummary, coreKeywords, effectsMarkup, stageDateMarkup, progressMarkup, textUnits, compactTitle, compactSummaryLines, compactDate, compactState, compactEffects } = W;
  function compactRow(item, number, font, groupByAgency = false) {
    const columns = [20, 146, 102, 184, 103];
    const line = font * 1.25;
    const summary = compactSummaryLines(item, Math.floor((columns[3] - 6) / font) - 1);
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
    const coloredRuns = (value, item) => {
      const text = String(value), terms = item ? coreKeywords(item).filter(term => term && text.includes(term)).sort((a,b) => b.length - a.length) : [];
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
    const cell = (values, width, index, heading = false, item = null) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/>${heading ? '<w:shd w:fill="DBEAFE"/>' : ''}</w:tcPr>${values.map((value, i) => para(value, { size:heading || (index === 1 && i === 0) ? 9 : 8, bold:heading || (index === 1 && i === 0), align:heading || index === 0 ? 'center' : 'left', keywordItem:!heading && index === 3 ? item : null })).join('')}</w:tc>`;
    const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="11100" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="8190A3"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="5" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="5" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${columns.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${['번호','법안정보','소관기관/진행현황','주요내용','기타 영향 및 효과'].map((value, index) => cell([value], columns[index], index, true)).join('')}</w:tr>${rows.map(row => row.item ? `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.values.map((values, index) => cell(values, columns[index], index, false, row.item)).join('')}</w:tr>` : `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="11100" w:type="dxa"/><w:gridSpan w:val="5"/><w:shd w:fill="EFF6FF"/></w:tcPr>${para(row.agency, {size:9,bold:true,keep:true})}</w:tc></w:tr>`).join('')}</w:tbl>`;
    // Let Word paginate the continuous table using the actual installed font.
    // Estimated page breaks otherwise create extra blank space at fixed 8pt.
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
