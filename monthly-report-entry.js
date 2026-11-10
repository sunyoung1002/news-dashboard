(function(){
"use strict";
const base=document.currentScript?.src||new URL("monthly-report-entry.js",document.baseURI).href,release="20261110-1";
window.MonthlyExcelReport=window.MonthlyExcelReport||{};window.MonthlyExcelReport.baseURL=base;
let ready=null;
function load(name){return new Promise((resolve,reject)=>{const script=document.createElement("script"),url=new URL(name,base);url.searchParams.set("v",release);script.src=url.href;script.onload=resolve;script.onerror=()=>{script.remove();reject(Error(name+" 파일을 불러오지 못했습니다. 같은 폴더에 업로드했는지 확인하세요."));};document.head.append(script);});}
function install(){
 const anchor=document.getElementById("downloadReport");if(!anchor||document.getElementById("monthlyReportUpload"))return Boolean(anchor);
 const button=document.createElement("button");button.id="monthlyReportUpload";button.type="button";button.className=anchor.className;button.textContent="월별보고서";anchor.insertAdjacentElement("afterend",button);
 button.addEventListener("click",async()=>{button.disabled=true;button.textContent="월별보고서 불러오는 중…";try{if(!ready)ready=(async()=>{for(const name of ["monthly-report-zip.js","monthly-report-excel.js","monthly-report-model.js","monthly-report-template-1.js","monthly-report-template-2.js","monthly-report-docx.js","monthly-report-ui.js"])await load(name);})();await ready;window.MonthlyExcelReport.open();}catch(error){ready=null;window.alert(error.message);}finally{button.disabled=false;button.textContent="월별보고서";}});return true;
}
if(!install()){const observer=new MutationObserver(()=>{if(install())observer.disconnect();});observer.observe(document.documentElement,{childList:true,subtree:true});}
})();
