(function(W){
  "use strict";
  const number=row=>String(row?.billNo??"").match(/(?:^|\D)(\d{7})(?!\d)/)?.[1]||"";
  const normalize=value=>String(value||"").replace(/[\s·ㆍ]/g,"");
  const describe=row=>({billNo:number(row),billId:String(row.billId||""),title:String(row.title||""),proposer:String(row.proposer||""),proposeDate:String(row.proposeDate||""),stage:String(row.stage||""),processingResult:String(row.processingResult||""),change:String(row.change||""),catalogCheckedAt:String(row.catalogCheckedAt||""),officialDetailCheckedAt:String(row.officialDetailCheckedAt||""),month:String(row.month||"")});
  function analyze(items){
    const groups=new Map();let anonymous=0;
    for(const item of items){
      const no=number(item),key=no?`bill:${no}`:item.billId?`id:${item.billId}`:`unidentified:${anonymous++}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    }
    const unique=W.uniqueFavoriteBills(items),kept=new Map(unique.map(item=>[number(item)?`bill:${number(item)}`:`id:${item.billId}`,item]));
    const duplicates=[...groups].filter(([,rows])=>rows.length>1).map(([key,rows])=>{
      const titles=new Set(rows.map(row=>normalize(row.title)).filter(Boolean));
      const dates=new Set(rows.map(row=>row.proposeDate).filter(Boolean));
      return {key,billNo:number(rows[0]),inputCount:rows.length,mergedEntryCount:rows.length-1,identityNeedsReview:titles.size>1||dates.size>1,entries:rows.map(describe),kept:describe(kept.get(key)||rows[0])};
    });
    return {createdAt:new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"medium"}).format(new Date()),registeredEntryCount:items.length,uniqueBillCount:unique.length,mergedEntryCount:items.length-unique.length,duplicateBillGroups:duplicates.length,identityReviewGroupCount:duplicates.filter(group=>group.identityNeedsReview).length,duplicates,allRegisteredEntries:items.map(describe)};
  }
  function reportText(report){
    const lines=[`등록 항목 ${report.registeredEntryCount}건 → Word ${report.uniqueBillCount}건`,`같은 의안으로 합친 추가 등록 ${report.mergedEntryCount}건 / 중복 그룹 ${report.duplicateBillGroups}개`,""];
    for(const group of report.duplicates){
      lines.push(`의안번호 ${group.billNo||group.key}: ${group.inputCount}개 등록 → 1개 출력 (${group.mergedEntryCount}개 합침)`);
      if(group.identityNeedsReview)lines.push("제목 또는 발의일 차이가 있어 동일 의안인지 추가 대조가 필요합니다.");
      group.entries.forEach((entry,index)=>lines.push(`  등록 ${index+1}: ${entry.title}\n  ${entry.proposer} / 내부 ID: ${entry.billId||"없음"}\n  ${entry.stage} ${entry.processingResult} / 자료 확인: ${entry.catalogCheckedAt||entry.officialDetailCheckedAt||entry.month||"기록 없음"}`));
      lines.push(`  출력에 유지: ${group.kept.title}\n  ${group.kept.proposer} / 내부 ID: ${group.kept.billId||"없음"}`,"");
    }
    if(!report.duplicates.length)lines.push("현재 목록에는 중복 등록이 없습니다. 이전 Word 파일 또는 다른 출력 범위와 비교했는지 확인해 주세요.");
    return lines.join("\n");
  }
  function openAudit(){
    const report=analyze(favoriteItems());
    document.getElementById("favoriteDuplicateAuditDialog")?.remove();
    const dialog=document.createElement("dialog");dialog.id="favoriteDuplicateAuditDialog";
    dialog.style.cssText="width:min(900px,90vw);max-height:85vh;overflow:auto;padding:20px;border:1px solid #bbc6d4;border-radius:12px;color:#14233b";
    const title=document.createElement("h2");title.textContent="주요법안 중복 내역";
    const text=document.createElement("pre");text.textContent=reportText(report);text.style.cssText="white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 sans-serif";
    const save=document.createElement("button");save.type="button";save.textContent="검사 내역 다운로드";
    save.addEventListener("click",()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json;charset=utf-8"}));
      const link=document.createElement("a");link.href=url;link.download="favorite-duplicate-audit.json";link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
    });
    const close=document.createElement("button");close.type="button";close.textContent="닫기";close.style.marginLeft="12px";close.addEventListener("click",()=>{dialog.close();dialog.remove();});
    dialog.append(title,text,save,close);document.body.appendChild(dialog);dialog.showModal();
  }
  function attach(){
    const word=document.querySelector("#downloadFavorites");
    if(!word)return false;
    if(!document.getElementById("favoriteDuplicateAuditButton")){
      const button=document.createElement("button");button.id="favoriteDuplicateAuditButton";button.type="button";
      button.className=word.className;button.textContent="중복 내역 확인";button.style.marginLeft="8px";button.addEventListener("click",openAudit);
      word.insertAdjacentElement("afterend",button);
    }
    return true;
  }
  W.analyzeFavoriteDuplicates=analyze;W.formatFavoriteDuplicateAudit=reportText;
  if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
})(window.LegislationWordParts);
