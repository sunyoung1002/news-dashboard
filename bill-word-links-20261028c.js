(function(W){
  "use strict";
  const number = item => String(item?.billNo || "").match(/\d{7}/)?.[0] || "";
  function linkedNumber(item){
    const values=[item?.alternativeBillNo,item?.absorbedBy,item?.alternativeNo,item?.substituteBillNo,item?.alternativeBill?.billNo,item?.alternative?.billNo];
    for(const value of values){const n=String(value||"").match(/\d{7}/)?.[0];if(n&&n!==number(item))return n;}
    const match=String(item?.change||"").match(/(?:위원회\s*)?대안\s*(?:의안번호\s*[:：]?\s*)?(\d{7})/);
    return match&&match[1]!==number(item)?match[1]:"";
  }
  const previous=W.compactPages;
  W.compactPages=function(items,group,font){
    const links=new Map(),conflicts=new Set();
    const existing=typeof state!=="undefined"?[...(state.data||[]),...(state.favoriteRows?.values?.()||[])]:[];
    for(const item of [...existing,...items]){
      const no=number(item),target=linkedNumber(item);if(!no||!target)continue;
      if(links.has(no)&&links.get(no)!==target)conflicts.add(no);else links.set(no,target);
    }
    const rows=items.map(item=>{
      const target=linkedNumber(item)||(!conflicts.has(number(item))?links.get(number(item)):"");
      return target?{...item,alternativeBillNo:target}:item;
    });
    const pages=previous(rows,group,font);
    for(const page of pages)for(const row of page){
      if(!row.item||!/대안\s*반영\s*폐기/.test(`${row.item.processingResult||""} ${row.item.change||""}`))continue;
      row.values[2]=row.values[2].filter(value=>!/^대안\s+\d{7}$/.test(value));
      const target=linkedNumber(row.item);
      row.values[2].push(target?`대안 의안번호: ${target}`:"대안 의안번호 미확보");
    }
    return pages;
  };
  W.alternativeNumber=linkedNumber;
  W.stableRelease="20261028c";
})(window.LegislationWordParts);
