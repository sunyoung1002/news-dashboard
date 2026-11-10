(function(M){
"use strict";
let dialog,book,sheet,sheetName="",sourceName="",headerAt=0,map={},parsed=null,version=0,issuesDirty=false;
const ids={};
const labels={number:"의안번호",title:"의안명",committee:"소관위",proposer:"대표발의자",summary:"주요내용",stage:"진행현황",result:"처리결과",proposal:"제안일",progress:"진행일",keywords:"핵심키워드"};
function el(tag,text,attrs={}){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;}
function previousMonth(value){const [year,month]=value.split("-").map(Number);return new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);}
function save(blob,name){const url=URL.createObjectURL(blob),a=el("a",undefined,{href:url,download:name});document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function message(text,error=false){ids.message.textContent=text;ids.message.style.color=error?"#b42318":"#334155";ids.message.setAttribute("role",error?"alert":"status");}
function create(){
 const style=el("style");style.textContent=`#monthlyReportDialog{width:min(1100px,94vw);max-width:94vw;max-height:88vh;border:1px solid #cbd5e1;border-radius:14px;padding:22px;color:#172b4d;background:white;overflow:auto}#monthlyReportDialog::backdrop{background:#0f172a66}#monthlyReportDialog *{box-sizing:border-box}#monthlyReportDialog button,#monthlyReportDialog input,#monthlyReportDialog select,#monthlyReportDialog textarea{font:inherit}#monthlyReportDialog button{cursor:pointer;padding:8px 12px;border:1px solid #b9c9df;border-radius:7px;background:#f4f8ff;color:#173f73}#monthlyReportDialog button:disabled{opacity:.5;cursor:wait}#monthlyReportDialog .mr-head{display:flex;gap:16px;justify-content:space-between;align-items:center}#monthlyReportDialog h2{margin:0;font-size:21px}#monthlyReportDialog p{font-size:13px;line-height:1.6}#monthlyReportDialog .mr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0}#monthlyReportDialog label{display:flex;flex-direction:column;gap:6px;font-size:13px}#monthlyReportDialog input,#monthlyReportDialog select,#monthlyReportDialog textarea{width:100%;min-width:0;border:1px solid #cbd5e1;padding:8px;border-radius:6px;color:#172b4d;background:white}#monthlyReportDialog textarea{min-height:85px;resize:vertical}#monthlyReportDialog table{width:100%;border-collapse:collapse;font-size:12px}#monthlyReportDialog th,#monthlyReportDialog td{border:1px solid #d5dde7;padding:7px;text-align:left;vertical-align:top;word-break:break-word}#monthlyReportDialog th{background:#eef3fa}#monthlyReportDialog .mr-scroll{max-height:280px;overflow:auto;margin:12px 0}#monthlyReportDialog details{border-top:1px solid #e2e8f0;padding:12px 0}#monthlyReportDialog summary{cursor:pointer;font-weight:600}#monthlyReportDialog .mr-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:18px}#monthlyReportDialog .mr-editor{display:grid;grid-template-columns:1fr 180px;gap:10px;border-bottom:1px solid #e2e8f0;padding:10px 0}#monthlyReportDialog pre{white-space:pre-wrap;font:13px/1.6 sans-serif}@media(max-width:600px){#monthlyReportDialog .mr-editor{grid-template-columns:1fr}}`;
 document.head.appendChild(style);
 dialog=el("dialog",undefined,{id:"monthlyReportDialog","aria-labelledby":"monthlyReportTitle"});
 const head=el("div",undefined,{class:"mr-head"}),title=el("h2","월별보고서",{id:"monthlyReportTitle"}),close=el("button","닫기",{type:"button"});close.addEventListener("click",()=>dialog.close());head.append(title,close);dialog.append(head);
 dialog.append(el("p","엑셀의 ‘주요법안현황’ 시트를 읽어 첨부 양식의 Word 보고서를 만듭니다. 파일은 이 브라우저 안에서 처리되며 서버에 전송하지 않습니다."));
 const grid=el("div",undefined,{class:"mr-grid"});
 function field(id,label,type,value){const holder=el("label",label),input=el(type==="select"?"select":"input",undefined,type==="select"?{}:{type});input.id="mr-"+id;if(value)input.value=value;holder.append(input);grid.append(holder);ids[id]=input;return input;}
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const month=typeof state!=="undefined"&&/^\d{4}-\d{2}$/.test(state.month)?state.month:today.slice(0,7);
 field("file","엑셀 파일","file").accept=".xlsx,.csv";
 field("sheet","시트","select");field("month","보고 기준월","month",month);field("issueMonth","이슈 대상월","month",previousMonth(month));field("date","작성일","date",today);field("header","머리글 행","number").min="1";
 dialog.append(grid);
 const template=el("button","입력 열 안내 내려받기",{type:"button"});template.addEventListener("click",()=>save(new Blob(["\ufeff의안번호,의안명,소관위원회,대표발의자,주요내용,진행현황,처리결과,제안일,진행일,핵심키워드,소관위 회부일,소관위 전체회의 상정일,법안소위 상정일,소관위 의결일,법사위 회부일,법사위 상정일,본회의 의결일,공포일\r\n"],{type:"text/csv;charset=utf-8"}),"월별보고서_입력열안내.csv"));dialog.append(template);
 ids.message=el("pre","엑셀을 선택하세요.");dialog.append(ids.message);
 const columns=el("details"),summary=el("summary","열 연결 확인·변경");ids.columns=el("div",undefined,{class:"mr-grid"});columns.append(summary,ids.columns);dialog.append(columns);
 ids.stats=el("p","");dialog.append(ids.stats);
 ids.preview=el("div",undefined,{class:"mr-scroll"});dialog.append(ids.preview);
 const issueLabel=el("label","월간 이슈 및 요약 — 엑셀 내용으로 만든 초안이며 수정할 수 있습니다.");ids.issues=el("textarea",undefined,{rows:"7"});issueLabel.append(ids.issues);dialog.append(issueLabel);
 const redo=el("button","이슈 초안 다시 만들기",{type:"button"});redo.addEventListener("click",()=>{issuesDirty=false;draft();});dialog.append(redo);
 const editors=el("details");editors.append(el("summary","법안별 주요내용·핵심어 수정"));ids.editors=el("div");editors.append(ids.editors);dialog.append(editors);
 const actions=el("div",undefined,{class:"mr-actions"});ids.reset=el("button","파일 초기화",{type:"button"});ids.download=el("button","Word 보고서 만들기",{type:"button",disabled:""});actions.append(ids.reset,ids.download);dialog.append(actions);document.body.appendChild(dialog);
 ids.file.addEventListener("change",loadFile);ids.sheet.addEventListener("change",loadSheet);ids.header.addEventListener("change",()=>{headerAt=Number(ids.header.value)-1;columnsUI();rebuild();});
 ids.month.addEventListener("change",()=>{if(ids.month.value){ids.issueMonth.value=previousMonth(ids.month.value);if(!issuesDirty)draft();}});ids.issueMonth.addEventListener("change",()=>{if(!issuesDirty)draft();});ids.issues.addEventListener("input",()=>{issuesDirty=true;});
 ids.reset.addEventListener("click",()=>{version++;book=sheet=parsed=null;sourceName=sheetName="";ids.file.value="";ids.sheet.replaceChildren();ids.columns.replaceChildren();ids.preview.replaceChildren();ids.editors.replaceChildren();ids.stats.textContent="";ids.issues.value="";ids.download.disabled=true;message("엑셀을 선택하세요.");});
 ids.download.addEventListener("click",download);
}
async function loadFile(){
 const file=ids.file.files[0];if(!file)return;const mine=++version;book=sheet=parsed=null;ids.download.disabled=true;ids.preview.replaceChildren();ids.editors.replaceChildren();ids.stats.textContent="";message("엑셀을 읽고 있습니다.");
 try{const opened=await M.openExcel(file);if(mine!==version)return;book=opened;sourceName=file.name;ids.sheet.replaceChildren();for(const s of book.sheets){const option=el("option",s.name,{value:s.id});ids.sheet.append(option);}const preferred=book.sheets.find(s=>M.norm(s.name).includes("주요법안현황"))||book.sheets[0];if(!preferred)throw Error("엑셀에 시트가 없습니다.");ids.sheet.value=preferred.id;await loadSheet();}catch(error){if(mine===version)message(error.message,true);}
}
async function loadSheet(){
 if(!book)return;const mine=++version;ids.download.disabled=true;message("시트 내용을 확인하고 있습니다.");
 try{const loaded=await book.sheet(ids.sheet.value);if(mine!==version)return;sheet=loaded;sheetName=book.sheets.find(s=>s.id===ids.sheet.value)?.name||"";headerAt=M.detectHeader(sheet);ids.header.value=headerAt+1;map=M.mapping(M.headers(sheet,headerAt));issuesDirty=false;columnsUI();rebuild();}catch(error){if(mine===version)message(error.message,true);}
}
function columnsUI(){
 if(!sheet)return;ids.columns.replaceChildren();const headers=M.headers(sheet,headerAt);
 for(const field of M.fields){const label=el("label",labels[field]),select=el("select");select.append(el("option","미지정",{value:"-1"}));headers.forEach((value,index)=>select.append(el("option",`${index+1}. ${value}`,{value:index})));select.value=String(map[field]??-1);select.addEventListener("change",()=>{map[field]=Number(select.value);rebuild();});label.append(select);ids.columns.append(label);}
}
function draft(){if(parsed)ids.issues.value=M.issueDraft(parsed.rows,ids.issueMonth.value);}
function stats(){
 if(!parsed)return;const plan=M.plan(parsed.rows),missing=parsed.rows.filter(r=>!r.summary).length,long=parsed.rows.filter(r=>M.summaryLines(r.summary).length>2||M.summaryLines(r.summary).some(line=>M.units(line)>27)).length;
 ids.stats.textContent=`총 ${plan.total}건 = 주요 관리 ${plan.top.length}건 + 기타 ${plan.other.length}건 + 대안반영폐기 ${plan.absorbed.length}건 · 중복 통합 ${parsed.duplicates}건 · 주요내용 미입력 ${missing}건 · 2줄 초과 가능 ${long}건`;
}
function preview(){
 ids.preview.replaceChildren();const table=el("table"),head=el("tr");for(const text of ["의안번호","의안명","진행현황","주요내용"])head.append(el("th",text));table.append(head);
 for(const row of parsed.rows.slice(0,20)){const tr=el("tr");for(const text of [row.number||"미기재",row.shortTitle,row.result||row.stage,row.summary||"미입력"])tr.append(el("td",text));table.append(tr);}ids.preview.append(table);if(parsed.rows.length>20)ids.preview.append(el("p",`미리보기는 앞 20건이며 Word에는 전체 ${parsed.rows.length}건이 포함됩니다.`));
}
function rebuild(){
 ids.download.disabled=true;if(!sheet)return;
 try{if(map.title<0)throw Error("‘열 연결’에서 의안명 열을 선택하세요.");if(headerAt<0||headerAt>=sheet.rows.length)throw Error("머리글 행을 확인하세요.");parsed=M.makeRows(sheet,headerAt,map);if(!parsed.rows.length)throw Error("법안 행을 찾지 못했습니다. 시트·머리글 행·의안명 열을 확인하세요.");if(parsed.rows.length>3000)throw Error("한 보고서에는 3,000건 이하로 입력해 주세요.");
  stats();preview();ids.editors.replaceChildren();for(const row of parsed.rows){const holder=el("div",undefined,{class:"mr-editor"}),label=el("label",`${row.number||"번호 미기재"} ${row.shortTitle}`),textarea=el("textarea");textarea.value=row.summary;label.append(textarea);const keyLabel=el("label","핵심어 최대 2개 (쉼표 구분)"),keys=el("input",undefined,{type:"text"});keys.value=row.keywords.join(", ");keyLabel.append(keys);textarea.addEventListener("input",()=>{row.summary=textarea.value;row.keywords=M.keywords(row.summary,keys.value);stats();if(!issuesDirty)draft();});keys.addEventListener("input",()=>{row.keywords=M.keywords(row.summary,keys.value);});holder.append(label,keyLabel);ids.editors.append(holder);}
  if(!issuesDirty)draft();if(parsed.errors.length)throw Error(parsed.errors.join("\n"));ids.download.disabled=false;message(`파일 읽기 완료: ${sourceName} / ${sheetName}\n${parsed.warnings.slice(0,5).join("\n")}`);
 }catch(error){message(error.message,true);}
}
async function download(){
 if(!parsed||parsed.errors.length)return;if(!ids.month.value||!ids.date.value||!ids.issueMonth.value){message("보고 기준월·이슈 대상월·작성일을 확인하세요.",true);return;}
 ids.download.disabled=true;message("첨부 양식으로 Word 보고서를 만들고 있습니다.");
 try{const result=await M.makeReport(parsed.rows,{reportDate:ids.date.value,issueMonth:ids.issueMonth.value,issues:ids.issues.value,sourceName,sheetName});save(result.blob,`${ids.month.value}_주요법안현황_월별보고서.docx`);message(`Word 다운로드 완료: 총 ${result.plan.total}건. 업로드한 엑셀의 내용과 날짜를 사용했습니다.`);}catch(error){message(error.message,true);}finally{ids.download.disabled=false;}
}
M.open=function(){if(!dialog)create();if(!dialog.open)dialog.showModal();};
})(window.MonthlyExcelReport);
