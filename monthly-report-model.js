(function(M){
"use strict";
const aliases={number:["의안번호","법안번호"],title:["의안명","법안명","법률안명","법안정보"],committee:["소관위원회","소관위","위원회"],proposer:["대표발의자","대표발의","발의의원","제안자","발의자"],summary:["주요내용요약","주요내용","제안이유및주요내용","요약"],stage:["진행현황","진행단계","심사단계","현재상태"],result:["처리결과","의결결과"],proposal:["제안일자","제안일","발의일자","발의일","접수일자","접수일"],progress:["진행일자","진행일","최종진행일","최종변동일"],keywords:["핵심키워드","핵심어","키워드"]};
function mapping(headers){
 const keys=headers.map(M.norm),out={};
 for(const [field,names]of Object.entries(aliases)){
  let index=keys.findIndex(k=>names.some(n=>k===n));
  if(index<0)index=keys.findIndex(k=>names.some(n=>k.includes(n))&&!/회부|상정|의결|소위/.test(k));
  out[field]=index;
 }return out;
}
function date(value,date1904=false){
 const s=String(value??"").trim();let y,m,d;
 const match=s.match(/(\d{2,4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/)||s.match(/^(\d{4})(\d{2})(\d{2})$/);
 if(match){y=Number(match[1]);if(y<100)y+=2000;m=Number(match[2]);d=Number(match[3]);}
 else if(/^\d+(?:\.\d+)?$/.test(s)&&Number(s)>=20000&&Number(s)<90000){const t=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(Number(s))*86400000);return t.toISOString().slice(0,10);}
 else return "";
 const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?t.toISOString().slice(0,10):"";
}
function eventKey(header){
 const s=M.norm(header);let phase=/공포|시행/.test(s)?"공포":/본회의/.test(s)?"본회의":/법사위|법제사법/.test(s)?"법사위":/소위|소위원/.test(s)?"소위":/소관위|상임위/.test(s)?"소관위":"";
 const action=/의결|처리/.test(s)?"의결":/상정/.test(s)?"상정":/회부/.test(s)?"회부":"";
 if(phase==="공포")return {rank:80,label:"공포",bucket:"공포",sub:""};
 if(!phase||!action)return null;
 const base={"본회의":50,"법사위":35,"소위":20,"소관위":5}[phase];
 const rank=base+({회부:1,상정:5,의결:10}[action]);
 return {rank,label:phase==="소위"?`법안소위 ${action}`:phase==="소관위"&&action==="상정"?"전체회의 상정":`${phase} ${action}`,bucket:phase==="소위"?"소관위":phase,sub:phase==="소위"?(action==="상정"?"법안소위 상정":action==="의결"?"의결":"소위 회부"):phase==="소관위"?(action==="상정"?"전체회의 상정":action):""};
}
function stage(raw){
 const s=M.norm(raw);
 if(/공포|시행/.test(s))return {rank:80,label:"공포·시행",bucket:"공포",sub:""};
 if(/본회의/.test(s))return {rank:/가결|의결/.test(s)?70:/상정/.test(s)?55:51,label:/의결/.test(s)?"본회의 의결":/상정/.test(s)?"본회의 상정":"본회의",bucket:"본회의",sub:""};
 if(/법사위|법제사법/.test(s))return {rank:/의결/.test(s)?45:/상정/.test(s)?40:36,label:/의결/.test(s)?"법사위 의결":/상정/.test(s)?"법사위 상정":/회부/.test(s)?"법사위 회부":"법사위",bucket:"법사위",sub:""};
 if(/소위|소위원/.test(s)){const kind=/의결/.test(s)?"의결":/상정/.test(s)?"상정":/회부/.test(s)?"회부":"";return {rank:kind==="의결"?30:kind==="상정"?25:20,label:"법안소위"+(kind?" "+kind:""),bucket:"소관위",sub:kind==="상정"?"법안소위 상정":kind==="의결"?"의결":kind==="회부"?"소위 회부":"세부 미확인"};}
 if(/전체회의|상임위.*상정|소관위.*상정/.test(s))return {rank:10,label:"전체회의 상정",bucket:"소관위",sub:"전체회의 상정"};
 if(/소관위|상임위|회부/.test(s))return {rank:/의결/.test(s)?15:6,label:/의결/.test(s)?"소관위 의결":/회부/.test(s)?"소관위 회부":raw.trim(),bucket:"소관위",sub:/의결/.test(s)?"의결":/회부/.test(s)?"회부":"세부 미확인"};
 if(/접수|발의|제출/.test(s))return {rank:1,label:"접수",bucket:"접수",sub:""};
 return {rank:0,label:raw.trim()||"단계 미확인",bucket:"단계 미확인",sub:""};
}
const shortRules=[["자본시장과 금융투자업에 관한 법률","자본시장법"],["독점규제 및 공정거래에 관한 법률","공정거래법"],["가맹사업거래의 공정화에 관한 법률","가맹사업법"],["대규모유통업에서의 거래 공정화에 관한 법률","대규모유통업법"],["대리점거래의 공정화에 관한 법률","대리점법"],["하도급거래 공정화에 관한 법률","하도급법"],["대·중소기업 상생협력 촉진에 관한 법률","상생협력법"],["상속세 및 증여세법","상속세·증여세법"]];
function shortTitle(value){
 let s=String(value||"").replace(/\s*\(?의안번호\s*[:：]?\s*\d{7}\)?/g,"").replace(/\s*\(\d{7}\)/g,"").trim();
 for(const [a,b]of shortRules)s=s.replace(a,b);
 return s.replace(/\s*(일부|전부)개정법률안/g,"").trim();
}
function brief(value){
 const s=String(value||"").replace(/^(?:이에|그러나|따라서|또한|하지만|그래서|이미)\s*[,，]?\s*/,"").trim();
 return s;
}
const terms=["지속가능성 공시","자료제출명령","비밀유지명령","의무공개매수","지속가능보고서","주식매수청구권","자료제출","손해배상","대금연동","세액공제","소득공제","소득세","합병가액","이사회 공시","이의신청","신주 배정","집단소송","증거조사","주주보호","납품대금","하도급대금","과징금","담합","공시기준","제3자 인증","ESG 공시","자기주식","책임 유예","공시","의결권","장애보상금","유족급여"];
function keywords(text,provided){
 const typed=String(provided||"").replace(/^핵심(?:키워드|어)\s*[:：]?/,"").split(/[,，;；\n|/]+/).map(x=>x.trim()).filter(x=>x&&text.includes(x));
 return [...new Set(typed.length?typed:terms.filter(x=>text.includes(x)).filter((x,_,a)=>!a.some(y=>x!==y&&y.includes(x))))].slice(0,2);
}
const units=text=>[...String(text)].reduce((n,c)=>n+(/\s/.test(c)?.32:/[a-z0-9.,:;()\-]/i.test(c)?.56:1),0);
function summaryLines(text){
 const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length<=2&&lines.every(x=>units(x)<=27))return lines;
 const s=lines.join(" ");let cut=0,width=0;
 for(const c of s){if(width+units(c)>27)break;width+=units(c);cut+=c.length;}
 const at=s.lastIndexOf(" ",cut);if(at>0&&units(s.slice(at+1))<=27)cut=at;
 return cut<s.length?[s.slice(0,cut).trim(),s.slice(cut).trim()].filter(Boolean):[s];
}
function makeRows(sheet,headerAt,map){
 const labels=M.headers(sheet,headerAt),eventColumns=labels.map((h,i)=>({i,event:eventKey(h)})).filter(x=>x.event);
 const get=(row,key)=>map[key]>=0?String(row[map[key]]??"").trim():"";
 const rows=[],errors=[],warnings=[];
 for(let ri=headerAt+1;ri<sheet.rows.length;ri++){
  const raw=sheet.rows[ri],title=get(raw,"title");if(!raw.some(v=>String(v??"").trim()))continue;
  if(/^(合計|합계|총계|소계|의안명|법안명|구분)$/.test(M.norm(title)))continue;
  const number=(get(raw,"number")+" "+title).match(/(?:^|\D)(\d{7})(?!\d)/)?.[1]||"";
  if(!title){if(number)errors.push(`${ri+1}행: 의안명이 비어 있습니다.`);continue;}
  if(!number&&!/법|조례|결의|동의|승인/.test(title)&&!get(raw,"summary")&&!get(raw,"proposer"))continue;
  if(!number)warnings.push(`${ri+1}행: 의안번호가 없어 중복 확인에서 제외합니다.`);
  const result=get(raw,"result"),stageText=get(raw,"stage"),fullStage=[stageText,result].join(" ");
  const ended=fullStage.match(/대안\s*반영\s*폐기|철회|부결|임기만료폐기|폐기/)?.[0]?.replace(/\s/g,"")||"";
  let latest=stage(stageText);let progressDate=date(get(raw,"progress"),sheet.date1904)||date(stageText,sheet.date1904);
  for(const col of eventColumns){const d=date(raw[col.i],sheet.date1904);if(d&&(col.event.rank>latest.rank||!progressDate&&col.event.rank===latest.rank)){latest=col.event;progressDate=d;}}
  let summary=brief(get(raw,"summary"));
  const proposer=get(raw,"proposer").replace(/\s*(?:등|외)\s*[\d,]+\s*인/g,"").replace(/의원$/g,"").trim();
  const row={number,title,shortTitle:shortTitle(title),committee:get(raw,"committee"),proposer,summary,keywords:keywords(summary,get(raw,"keywords")),proposalDate:date(get(raw,"proposal"),sheet.date1904),progressDate,stage:latest.label,bucket:ended?"기타 종결":latest.bucket,sub:ended?"":latest.sub,rank:latest.rank,result:ended||result||(/원안가결|수정가결/.exec(stageText)?.[0]||""),absorbed:ended==="대안반영폐기",sourceRow:ri+1};
  rows.push(row);
 }
 const groups=new Map();let duplicates=0;
 for(const row of rows){
  const key=row.number||`row:${row.sourceRow}`,old=groups.get(key);
  if(!old){groups.set(key,row);continue;}
  duplicates++;
  if(M.norm(old.shortTitle)!==M.norm(row.shortTitle)||(old.proposalDate&&row.proposalDate&&old.proposalDate!==row.proposalDate))errors.push(`의안번호 ${row.number}: 제목 또는 제안일이 다른 중복 행입니다.`);
  const newer=row.progressDate>old.progressDate||row.progressDate===old.progressDate&&row.rank>old.rank?row:old;
  groups.set(key,{...newer,summary:newer.summary||old.summary||row.summary,keywords:newer.keywords.length?newer.keywords:(old.keywords.length?old.keywords:row.keywords)});
 }
 return {rows:[...groups.values()],sourceCount:rows.length,duplicates,errors,warnings};
}
function plan(rows){
 const sorted=[...rows].sort((a,b)=>Number(/원안가결/.test(b.result))-Number(/원안가결/.test(a.result))||b.rank-a.rank||b.progressDate.localeCompare(a.progressDate)||b.proposalDate.localeCompare(a.proposalDate)||a.sourceRow-b.sourceRow);
 const top=sorted.filter(x=>!x.absorbed).slice(0,10),ids=new Set(top),other=sorted.filter(x=>!x.absorbed&&!ids.has(x)),absorbed=sorted.filter(x=>x.absorbed),counts={},details={};
 for(const row of rows){counts[row.bucket]=(counts[row.bucket]||0)+1;if(row.bucket==="소관위")details[row.sub||"세부 미확인"]=(details[row.sub||"세부 미확인"]||0)+1;}
 if(top.length+other.length+absorbed.length!==rows.length)throw Error("법안 분류 건수가 일치하지 않습니다.");
 return {top,other,absorbed,counts,details,total:rows.length};
}
function issueDraft(rows,month){
 const groups=new Map();for(const row of rows.filter(x=>x.proposalDate.startsWith(month)&&!x.absorbed)){const key=row.shortTitle;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups].slice(0,3).map(([title,list])=>"• "+title+"\n"+list.slice(0,2).map(row=>`${row.proposer||"제안자 미기재"}안(${row.number||"번호 미기재"}): ${row.summary||"주요내용 미입력"}`).join("\n")).join("\n\n");
}
Object.assign(M,{mapping,makeRows,plan,date,shortTitle,keywords,summaryLines,units,issueDraft,fields:Object.keys(aliases)});
})(window.MonthlyExcelReport);
