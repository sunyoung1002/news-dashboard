(function(W){
  "use strict";
  const billNumber=row=>String(row?.billNo??"").match(/(?:^|\D)(\d{7})(?!\d)/)?.[1]||"";
  const clean=value=>String(value||"").replace(/[\s·ㆍ]/g,"");
  const stamp=value=>{
    const match=String(value||"").match(/^(\d{4})[-./](\d{2})[-./](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return match?match.slice(1).map(value=>value||"00").join(""):"";
  };
  function freshness(row){
    const checked=[row.catalogCheckedAt,row.officialDetailCheckedAt,row.statusCheckedAt].map(stamp).sort().at(-1)||"";
    return [checked,String(row.month||""),stamp(row.changedDate),Number(/^PRC_/.test(String(row.billId||"")))];
  }
  function compare(a,b){
    const left=freshness(a),right=freshness(b);
    for(let i=0;i<left.length;i++){if(left[i]>right[i])return -1;if(left[i]<right[i])return 1;}
    return 0;
  }
  function sameIdentity(a,b){
    return (!a.title||!b.title||clean(a.title)===clean(b.title))&&
      (!a.proposeDate||!b.proposeDate||a.proposeDate===b.proposeDate);
  }
  const meaningful=value=>{
    const text=String(value||"").trim();
    return text.length>=12&&!/확인\s*중|미수집|미확보|확인\s*필요|추가\s*요약|관련\s*내용임/.test(text);
  };
  function combine(candidates){
    const sorted=[...candidates].sort(compare),latest=sorted[0];
    const merged={...latest};
    const matching=sorted.filter(row=>sameIdentity(row,latest));
    if(!meaningful(merged.summary)){
      const source=matching.find(row=>meaningful(row.summary));
      if(source)for(const field of ["summary","summarySource","summarySourceDate","summaryCheckedAt"]){if(source[field])merged[field]=source[field];}
    }
    // Fill bibliographic gaps without replacing the latest stage/result/date fields.
    for(const field of ["title","proposer","proposeDate","sourceUrl"]){
      if(!merged[field]){const source=matching.find(row=>row[field]);if(source)merged[field]=source[field];}
    }
    const explicit=W.alternativeNumber?.(latest)||"";
    const alternatives=new Set(matching.map(row=>W.alternativeNumber?.(row)).filter(Boolean));
    if(explicit)merged.alternativeBillNo=explicit;
    else if(alternatives.size===1)merged.alternativeBillNo=[...alternatives][0];
    return merged;
  }
  function uniqueBills(items){
    const selected=new Set(items.map(billNumber).filter(Boolean)),groups=new Map(),order=[];
    let missingNumber=0;
    function add(row,requested=false){
      if(!row)return;
      const number=billNumber(row);
      if(!requested&&(!number||!selected.has(number)))return;
      const key=number?`bill:${number}`:row.billId?`id:${row.billId}`:`unidentified:${missingNumber++}`;
      if(!groups.has(key)){groups.set(key,[]);if(requested)order.push(key);}
      groups.get(key).push(row);
    }
    items.forEach(row=>add(row,true));
    if(typeof state!=="undefined"){
      for(const row of state.data||[])add(row);
      for(const row of state.favoriteRows?.values?.()||[])add(row);
    }
    return order.map(key=>combine(groups.get(key)));
  }
  function exportUnique(items,title,filename,groupByAgency){
    const rows=uniqueBills(items);
    if(!rows.length){window.alert("Word 보고서로 출력할 법안이 없습니다.");return;}
    const sorted=groupByAgency?[...rows].sort((a,b)=>String(a.agency||"기타").localeCompare(String(b.agency||"기타"),"ko")||String(a.title||"").localeCompare(String(b.title||""),"ko")):rows;
    W.compactZip(W.compactDocx(W.compactPages(sorted,groupByAgency,8),title,rows.length,8,1,1),filename.replace(/\.docx?$/i,"")+".docx");
  }
  const previous=downloadItemsWordReport;
  downloadItemsWordReport=function(items,title,filename,filter="",group=false){
    if(/주요법안현황|즐겨찾기/.test(`${title} ${filter}`))return exportUnique(items,title,filename,group);
    return previous(items,title,filename,filter,group);
  };
  W.uniqueFavoriteBills=uniqueBills;
  W.downloadCompactFavorites=exportUnique;
  W.dedupRelease="20261029";
})(window.LegislationWordParts);
