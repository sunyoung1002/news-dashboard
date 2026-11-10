(function(M){
"use strict";
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main",X="http://www.w3.org/XML/1998/namespace";
let templatePromise=null;
function template(){
 if(!templatePromise)templatePromise=(async()=>{if(!M.templateChunks?.[0]||!M.templateChunks?.[1])throw Error("보고서 양식 파일이 누락되었습니다. monthly-report-template-1.js와 monthly-report-template-2.js 업로드를 확인하세요.");const raw=atob(M.templateChunks.join("")),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return M.unzip(bytes);})().catch(error=>{templatePromise=null;throw error;});
 return templatePromise;
}
async function makeReport(rows,options){
 const archive=await template(),doc=M.xml(await archive.text("word/document.xml")),body=M.all(doc,"body")[0],saved=new Map();
 for(const p of M.all(body,"p")){const key=M.text(p).match(/^\{\{([A-Z_]+)\}\}$/)?.[1];if(key)saved.set(key,p.cloneNode(true));}
 const tableProto=M.all(body,"tbl")[0]?.cloneNode(true),sect=M.all(body,"sectPr")[0]?.cloneNode(true);
 if(!tableProto||!sect||!saved.has("TITLE"))throw Error("보고서 양식 파일이 올바르지 않습니다.");
 while(body.firstChild)body.removeChild(body.firstChild);
 const element=name=>doc.createElementNS(W,"w:"+name);
 function setting(parent,name,value){let e=[...parent.children].find(x=>x.localName===name);if(!e){e=element(name);parent.appendChild(e);}e.setAttributeNS(W,"w:val",String(value));return e;}
 function run(text,proto,options={}){
  const r=element("r"),pr=proto?.cloneNode(true)||element("rPr");
  if(options.size)setting(pr,"sz",Math.round(options.size*2));
  if(options.color)setting(pr,"color",options.color);
  if(Object.hasOwn(options,"bold"))setting(pr,"b",options.bold?"1":"0");
  r.appendChild(pr);const t=element("t");t.setAttributeNS(X,"xml:space","preserve");t.textContent=String(text);r.appendChild(t);return r;
 }
 function fillP(p,text,options={}){
  const ppr=[...p.children].find(x=>x.localName==="pPr"),firstRun=[...p.children].find(x=>x.localName==="r"),proto=(firstRun?M.all(firstRun,"rPr")[0]:null)?.cloneNode(true);
  for(const child of [...p.children])if(child!==ppr)p.removeChild(child);
  if(!options.terms?.length){String(text).split("\n").forEach((line,i)=>{if(i){const br=element("r");br.appendChild(element("br"));p.appendChild(br);}p.appendChild(run(line,proto,options));});return p;}
  let pos=0;const used=options.used||new Set();
  while(pos<String(text).length){
   const hits=options.terms.filter(term=>!used.has(term)).map(term=>({term,at:String(text).indexOf(term,pos)})).filter(hit=>hit.at>=0).sort((a,b)=>a.at-b.at||b.term.length-a.term.length),next=hits[0];
   if(!next){p.appendChild(run(String(text).slice(pos),proto,options));break;}
   if(next.at>pos)p.appendChild(run(String(text).slice(pos,next.at),proto,options));
   p.appendChild(run(next.term,proto,{...options,color:"1565C0",bold:true}));used.add(next.term);pos=next.at+next.term.length;
  }return p;
 }
 function p(key,text){const node=saved.get(key)?.cloneNode(true);if(!node)throw Error("보고서 양식의 문단이 없습니다: "+key);const opts=key==="STATUS"?{size:10,bold:true}:key==="STATUS_DETAIL"?{size:8,bold:false}:{};return fillP(node,text,opts);}
 const append=(key,text)=>body.appendChild(p(key,text));
 function committee(value){return String(value||"미기재").replace(/법제사법위원회/g,"법사위").replace(/재정경제기획위원회|기획재정위원회/g,"재경위").replace(/정무위원회/g,"정무위").replace(/국토교통위원회/g,"국토위").replace(/산업통상자원중소벤처기업위원회|산업통상중소벤처기업위원회/g,"산자중기위");}
 function table(items){
  const node=tableProto.cloneNode(true),trs=[...node.children].filter(x=>x.localName==="tr"),proto=trs[1];for(const old of trs.slice(1))node.removeChild(old);
  let trpr=[...trs[0].children].find(x=>x.localName==="trPr");if(!trpr){trpr=element("trPr");trs[0].insertBefore(trpr,trs[0].firstChild);}setting(trpr,"tblHeader","1");
  for(const row of items){
   const tr=proto.cloneNode(true),cells=[...tr.children].filter(x=>x.localName==="tc"),date=row.progressDate.replace(/-/g,".");
   const label=row.result||row.stage,detail=(row.result&&row.stage!==row.result?row.stage+" ":"")+date;
   const values=[[row.shortTitle,row.number?`(${row.number})`:"(번호 미기재)"],[committee(row.committee)],[row.proposer||"미기재"],M.summaryLines(row.summary||"주요내용 미입력"),[label,detail].filter(Boolean)];
   cells.forEach((cell,i)=>{
    const first=M.all(cell,"p")[0].cloneNode(true),pr=[...cell.children].find(x=>x.localName==="tcPr");for(const child of [...cell.children])if(child!==pr)cell.removeChild(child);
    const used=new Set();for(const value of values[i]){const np=fillP(first.cloneNode(true),value,{size:i===4?7.5:8,terms:i===3?row.keywords:[],used});cell.appendChild(np);}
   });node.appendChild(tr);
  }
  if(!items.length){const tr=proto.cloneNode(true),cells=[...tr.children].filter(x=>x.localName==="tc");for(const c of cells){const first=M.all(c,"p")[0],pr=[...c.children].find(x=>x.localName==="tcPr");for(const child of [...c.children])if(child!==pr)c.removeChild(child);c.appendChild(fillP(first,"해당 없음",{size:8}));}node.appendChild(tr);}
  body.appendChild(node);
 }
 const plan=M.plan(rows),counts=["소관위","법사위","본회의","공포","접수","기타 종결","단계 미확인"].filter(key=>plan.counts[key]).map(key=>`${key} ${plan.counts[key]}건`).join(" · ");
 const detailKeys=["회부","전체회의 상정","법안소위 상정","의결",...Object.keys(plan.details).filter(k=>!["회부","전체회의 상정","법안소위 상정","의결"].includes(k))];
 const details=plan.counts['소관위']?detailKeys.map(key=>`${key} ${plan.details[key]||0}건`).join(" · "):"";
 append("TITLE","주요 법안현황 보고");append("DATE","일 자 : "+options.reportDate.replace(/-/g,". ")+".");
 append("STATUS_HEADING","□ 주요 법안현황");append("STATUS",`• ${counts} : 총 ${plan.total}건`);append("STATUS_DETAIL",details?`( 소관위 세부 : ${details} )`:"소관위 세부 진행정보 미기재");
 append("ISSUE_HEADING",`□ ${Number(options.issueMonth.slice(5))}월 발의 법안 이슈 및 요약`);
 const issue=String(options.issues||"").trim();
 if(issue){for(const block of issue.split(/\n\s*\n/)){const lines=block.trim().split("\n");append("ISSUE_TITLE",/^[•·]/.test(lines[0])?lines[0]:"• "+lines[0]);if(lines.length>1)append("ISSUE_BODY",lines.slice(1).join("\n"));}}
 else append("ISSUE_BODY","해당 월 발의 법안의 이슈 요약이 입력되지 않았습니다.");
 append("TOP_HEADING",`□ 주요 관리 법안 ${plan.top.length}건`);append("TOP_NOTE","※ 선정 순서 : 원안가결 표기 → 마지막 절차단계 → 진행일 → 제안일 순임. 대안반영폐기는 제외함.");table(plan.top);
 append("TABLE_NOTE","※ 의안명·소관위는 약칭으로 표기함. 진행현황 날짜는 업로드한 엑셀의 해당 단계 기재일임.");
 append("OTHER_HEADING",`□ 기타 법안 ${plan.other.length}건`);append("OTHER_NOTE",`주요 관리 ${plan.top.length}건과 대안반영폐기 ${plan.absorbed.length}건을 제외한 법안을 진행단계·진행일 순으로 기재함.`);table(plan.other);
 append("CLOSED_HEADING",`□ 대안반영폐기 법안 ${plan.absorbed.length}건`);append("CLOSED_NOTE","대안반영폐기 처리된 법안을 별도로 구분함. 주요 관리 및 기타 법안과 중복되지 않음.");table(plan.absorbed);
 append("SOURCE",`자료 : ${options.sourceName} · ${options.sheetName}`);body.appendChild(sect);
 const files=[];for(const name of archive.names){if(name.endsWith("/"))continue;files.push({name,content:name==="word/document.xml"?new XMLSerializer().serializeToString(doc):await archive.read(name)});}
 return {blob:M.zip(files),plan};
}
M.makeReport=makeReport;
})(window.MonthlyExcelReport);
