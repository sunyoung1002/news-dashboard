(function(M){
"use strict";
const decode=bytes=>new TextDecoder().decode(bytes);
function xml(text){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error("지원하지 않는 XML 선언입니다.");
 const doc=new DOMParser().parseFromString(text,"application/xml");
 if(doc.getElementsByTagName("parsererror").length)throw Error("파일의 XML을 읽지 못했습니다.");
 return doc;
}
const all=(node,name)=>[...node.getElementsByTagNameNS("*",name)];
const text=node=>all(node,"t").map(x=>x.textContent).join("");
async function unzip(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>25*1024*1024)throw Error("25MB 이하의 파일을 선택하세요.");
 let end=bytes.length-22;
 while(end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
 if(end<Math.max(0,bytes.length-65557))throw Error("정상적인 .xlsx/.docx 파일이 아닙니다.");
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error("분할 압축 파일은 지원하지 않습니다.");
 const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true),total=0;
 if(count>3000)throw Error("파일 내부 항목이 너무 많습니다.");
 const entries=new Map();
 for(let i=0;i<count;i++){
  if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw Error("압축 목록이 손상되었습니다.");
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),start=view.getUint32(offset+42,true);
  if(flags&1)throw Error("암호화된 파일은 지원하지 않습니다.");
  const name=decode(bytes.slice(offset+46,offset+46+length));
  if(name.startsWith("/")||name.split("/").includes("..")||entries.has(name))throw Error("안전하지 않은 내부 파일 경로입니다.");
  total+=size;if(size>30*1024*1024||total>80*1024*1024)throw Error("압축 해제 크기가 너무 큽니다.");
  if(start+30>bytes.length||view.getUint32(start,true)!==0x04034b50)throw Error("압축 파일이 손상되었습니다.");
  const pos=start+30+view.getUint16(start+26,true)+view.getUint16(start+28,true);
  if(pos+packed>bytes.length)throw Error("압축 데이터가 잘렸습니다.");
  entries.set(name,{method,size,data:bytes.slice(pos,pos+packed),crc:view.getUint32(offset+16,true)});
  offset+=46+length+extra+comment;
 }
 const cache=new Map();
 async function read(name){
  if(cache.has(name))return cache.get(name);
  const item=entries.get(name);if(!item)throw Error(`파일 내부 자료가 없습니다: ${name}`);
  let out;
  if(item.method===0)out=item.data;
  else if(item.method===8){
   let stream;try{stream=new Blob([item.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));}catch(_){throw Error("최신 Edge 또는 Chrome에서 다시 열어 주세요.");}
   const reader=stream.getReader(),chunks=[];let length=0;
   try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>item.size||length>30*1024*1024){await reader.cancel();throw Error("압축 크기 검증에 실패했습니다.");}chunks.push(part.value);}}finally{reader.releaseLock();}
   out=new Uint8Array(length);let at=0;for(const part of chunks){out.set(part,at);at+=part.length;}
  }else throw Error("지원하지 않는 압축 형식입니다.");
  if(out.length!==item.size||crc32(out)!==item.crc)throw Error("파일 무결성 검증에 실패했습니다.");
  cache.set(name,out);return out;
 }
 return {names:[...entries.keys()],read,async text(name){return decode(await read(name));}};
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(files){
 const encoder=new TextEncoder(),chunks=[],directory=[];let pos=0;
 const header=(size)=>{const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)];};
 for(const file of files){
  const name=encoder.encode(file.name),body=typeof file.content==="string"?encoder.encode(file.content):file.content,crc=crc32(body);
  const [head,h]=header(30+name.length);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,body.length,true);h.setUint32(22,body.length,true);h.setUint16(26,name.length,true);head.set(name,30);
  const [dir,d]=header(46+name.length);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,pos,true);dir.set(name,46);
  chunks.push(head,body);directory.push(dir);pos+=head.length+body.length;
 }
 const size=directory.reduce((n,x)=>n+x.length,0),[end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,pos,true);
 return new Blob([...chunks,...directory,end],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
Object.assign(M,{unzip,xml,all,text,zip,decode});
})(window.MonthlyExcelReport=window.MonthlyExcelReport||{});
