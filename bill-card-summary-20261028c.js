(function(){
  "use strict";
  const W=window.LegislationWordParts;
  const normalize=value=>String(value||"").replace(/[\s·ㆍ]/g,"");
  const number=item=>String(item?.billNo||"").match(/\d{7}/)?.[0]||"";
  // Official XLSX 2026-10-22: the alternative shown in the user's screenshot.
  const extra={"2216964":["산업안전보건법 일부개정법률안(대안)","2026-02-23",["사업주·근로자의 작업중지 조치를 확대하고,","반복 산재 사업주에 영업이익 5% 이내 과징금을 도입함."]]};
  function shortSummary(item,budget=95){
    const verified=extra[number(item)]||W.reviewedWordSummaries?.[number(item)];
    if(verified&&normalize(verified[0])===normalize(item.title)&&(!item.proposeDate||item.proposeDate===verified[1]))return verified[2].join("\n");
    const raw=String(item.summary||"").replace(/제안이유\s*및\s*주요내용|제안이유|주요내용/g,"").replace(/\(안[^)]*\)/g,"").trim();
    if(!raw||/미수집|확인\s*중|원문\s*확인\s*필요/.test(raw))return "주요내용 미수집 · 법안 제목을 눌러 공식 원문 확인";
    const sentences=raw.split(/(?<=[.!?])\s+|[\r\n]+/).map(text=>text
      .replace(/^\s*(?:[가-힣]|\d+)[.)]\s*/,"")
      .replace(/^(?:이에|그러나|따라서|그런데|또한|하지만|그래서|이미|이와\s*같이|이와\s*관련해서)\s*[,，]?\s*/,"")
      .replace(/하고자\s*하는\s*것임/g,"하고자 함").replace(/하기\s*위하여/g,"위해").replace(/\s+/g," ").trim())
      .filter(text=>text.length>=12&&!/^(?:현행|최근|지난|대안의\s*현행법)/.test(text));
    const policy=text=>/개정|도입|신설|확대|강화|의무|금지|과징금|하도록|하려는|하고자|마련/.test(text);
    const candidates=sentences.filter(policy).sort((a,b)=>Number(/하도록|하려는|하고자/.test(b))-Number(/하도록|하려는|하고자/.test(a)));
    const screen=window.LegislationDailyUI?.shortBillSummary?.(item);
    if(screen&&!/확인\s*중|관련\s*내용임/.test(screen))candidates.push(screen);
    const selected=candidates.find(text=>W.textUnits(text)<=budget)||candidates[0]||sentences.find(text=>W.textUnits(text)<=budget)||raw.replace(/\s+/g," ");
    return /[.!?]$/.test(selected)?selected:selected+".";
  }
  let sourceRef=null,sourceCount=-1,favoriteRef=null,favoriteCount=-1,byKey=new Map(),byNumber=new Map();
  function index(){
    if(typeof state==="undefined")return;
    if(sourceRef===state.data&&sourceCount===state.data.length&&favoriteRef===state.favoriteRows&&favoriteCount===state.favoriteRows.size)return;
    sourceRef=state.data;sourceCount=state.data.length;favoriteRef=state.favoriteRows;favoriteCount=state.favoriteRows.size;
    byKey=new Map();byNumber=new Map();
    for(const row of [...state.favoriteRows.values(),...state.data]){byKey.set(itemKey(row),row);byNumber.set(number(row),row);}
  }
  function apply(){
    index();
    document.querySelectorAll("#billList .bill-card").forEach(card=>{
      const item=byKey.get(card.dataset.billId)||byNumber.get(card.querySelector(".bill-meta")?.textContent?.match(/\d{7}/)?.[0]);
      const el=card.querySelector(".summary");if(!item||!el)return;
      const width=el.getBoundingClientRect?.().width||800;
      const style=window.getComputedStyle?.(el),font=parseFloat(style?.fontSize)||14;
      const text=shortSummary(item,Math.max(35,Math.floor(width/font)*2-4));
      if(el.textContent!==text)el.textContent=text;
      el.removeAttribute("title");
      for(const [key,value] of Object.entries({display:"block","white-space":"pre-line","overflow":"visible","overflow-x":"visible","overflow-y":"visible","text-overflow":"clip","-webkit-line-clamp":"unset","line-clamp":"unset","max-height":"none","line-height":"1.5","overflow-wrap":"anywhere","max-width":"100%","min-width":"0"}))el.style.setProperty(key,value,"important");
    });
  }
  const host=document.querySelector("#billList");
  if(host)new MutationObserver(apply).observe(host,{childList:true});
  const previous=renderCards;
  renderCards=function(items){previous(items);apply();};
  window.addEventListener?.("resize",apply);
  window.LegislationCardSummary={shortSummary,apply};
  apply();
})();
