(function(M){
"use strict";
const norm=value=>String(value??"").replace(/[\s_\-·ㆍ()（）]/g,"");
const col=ref=>{let n=0;for(const c of ref.match(/^[A-Z]+/i)?.[0]||"A")n=n*26+c.toUpperCase().charCodeAt(0)-64;return n-1;};
function csv(text){
 const rows=[];let row=[],value="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){row.push(value);value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);rows.push(row);row=[];value="";}else value+=c;}
 if(quoted)throw Error("CSV의 따옴표가 닫히지 않았습니다.");
 if(value||row.length){row.push(value);rows.push(row);}return rows;
}
async function openExcel(file){
 if(file.size>25*1024*1024)throw Error("25MB 이하의 엑셀을 선택하세요.");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(/\.csv$/i.test(file.name)){
  let value=M.decode(bytes);if(value.includes("\ufffd"))value=new TextDecoder("euc-kr").decode(bytes);
  const rows=csv(value.replace(/^\ufeff/,""));return {sheets:[{name:"CSV",id:"csv"}],async sheet(){return {rows,merges:[],date1904:false};}};
 }
 if(!/\.xlsx$/i.test(file.name))throw Error(".xlsx 파일을 선택하세요. .xls 파일은 Excel에서 .xlsx로 다시 저장한 뒤 선택해 주세요.");
 const archive=await M.unzip(bytes),book=M.xml(await archive.text("xl/workbook.xml")),rels=M.xml(await archive.text("xl/_rels/workbook.xml.rels"));
 const targets=new Map(M.all(rels,"Relationship").filter(r=>r.getAttribute("TargetMode")!=="External").map(r=>[r.getAttribute("Id"),r.getAttribute("Target")]));
 const sheets=M.all(book,"sheet").map(node=>({name:node.getAttribute("name"),id:node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")}));
 const date1904=["1","true"].includes(M.all(book,"workbookPr")[0]?.getAttribute("date1904"));
 let shared=[];
 if(archive.names.includes("xl/sharedStrings.xml"))shared=M.all(M.xml(await archive.text("xl/sharedStrings.xml")),"si").map(M.text);
 return {sheets,async sheet(id){
  const target=targets.get(id);if(!target)throw Error("시트 경로를 확인할 수 없습니다.");
  const parts=(target.startsWith("/")?target.slice(1):"xl/"+target).split("/"),path=[];for(const part of parts){if(part==="..")path.pop();else if(part!==".")path.push(part);}
  if(path[0]!=="xl")throw Error("시트 경로가 올바르지 않습니다.");
  const doc=M.xml(await archive.text(path.join("/"))),rows=[];
  for(const line of M.all(doc,"row")){
   const ri=Number(line.getAttribute("r")||rows.length+1)-1;if(ri>20000)throw Error("20,000행 이하의 시트를 선택하세요.");
   const cells=[];let next=0;
   for(const cell of M.all(line,"c")){
    const ci=cell.hasAttribute("r")?col(cell.getAttribute("r")):next;next=ci+1;if(ci>300)throw Error("시트 열 수가 너무 많습니다.");
    const type=cell.getAttribute("t"),v=M.all(cell,"v")[0]?.textContent??"";
    if(type==="e")throw Error(`${cell.getAttribute("r")}: 엑셀 오류값을 수정한 뒤 다시 선택하세요.`);
    if(M.all(cell,"f").length&&!M.all(cell,"v").length)throw Error(`${cell.getAttribute("r")}: 수식 결과가 저장되지 않았습니다. Excel에서 계산 후 저장해 주세요.`);
    cells[ci]=type==="s"?(shared[Number(v)]??""):type==="inlineStr"?M.text(cell):v;
   }
   rows[ri]=cells;
  }
  const merges=M.all(doc,"mergeCell").map(x=>x.getAttribute("ref"));return {rows:Array.from({length:rows.length},(_,i)=>rows[i]||[]),merges,date1904};
 }};
}
function headers(sheet,at){
 const rows=sheet.rows.slice(0,at+1).map(r=>[...r]);
 for(const ref of sheet.merges){const [a,b=a]=ref.split(":"),r0=Number(a.match(/\d+/)[0])-1,r1=Number(b.match(/\d+/)[0])-1,c0=col(a),c1=col(b);if(r0>at)continue;const value=rows[r0]?.[c0];for(let r=r0;r<=Math.min(r1,at);r++)for(let c=c0;c<=c1;c++)(rows[r]||=[])[c]=value;}
 const width=Math.max(0,...rows.slice(Math.max(0,at-2)).map(r=>r.length));
 const original=sheet.rows[at]||[];
 const simple=original.filter(Boolean).length>=4&&original.some(v=>/의안번호|의안명|법안명/.test(norm(v)));
 return Array.from({length:width},(_,c)=>{
  const values=(simple?[rows[at]?.[c]]:rows.slice(Math.max(0,at-2),at+1).map(r=>r[c])).filter(v=>v!==undefined&&String(v).trim());
  return [...new Set(values.map(String))].join(" ")||`열 ${c+1}`;
 });
}
function detectHeader(sheet){
 let best=0,score=-1;
 for(let r=0;r<Math.min(40,sheet.rows.length);r++){
  const line=sheet.rows[r].map(norm),n=line.reduce((s,x)=>s+(/의안명|법안명|의안번호|법안번호|주요내용|대표발의|진행현황|소관위/.test(x)?1:0),0);
  if(n>score){score=n;best=r;}
 }
 if(score<2)throw Error("의안명·의안번호 등의 머리글을 찾지 못했습니다. 입력양식의 열 이름을 확인해 주세요.");
 // A second header row may hold subcommittee dates under merged headings.
 const next=sheet.rows[best+1]||[];
 if(next.filter(v=>/회부|상정|의결|소위/.test(norm(v))).length>=2&&!next.some(v=>/\b\d{7}\b/.test(String(v))))best++;
 return best;
}
Object.assign(M,{openExcel,detectHeader,headers,norm,csv});
})(window.MonthlyExcelReport);
