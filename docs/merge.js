export const canonical=value=>JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const clone=value=>value===undefined?undefined:structuredClone(value);
const keyedViews=value=>Array.isArray(value)&&value.every(v=>object(v)&&typeof v.id==="string"&&v.id.length>0)&&new Set(value.map(v=>v.id)).size===value.length;
export function mergeDocuments(base,local,remote) {
  const conflicts=[];
  function merge(b,l,r,path) {
    if(canonical(l)===canonical(r))return clone(l);
    if(canonical(l)===canonical(b))return clone(r);
    if(canonical(r)===canonical(b))return clone(l);
    const key=path.at(-1);
    if(["updatedAt","_updatedAt","modified","configUpdatedAt","_commitId","commitId"].includes(key)&&[l,r].every(v=>typeof v==="string"))return l>r?l:r;
    if(["revision","_revision","configRevision"].includes(key)&&[l,r].every(Number.isFinite))return Math.max(l,r)+1;
    if(path.length===2&&path[0]==="config"&&key==="savedViews"&&keyedViews(l)&&keyedViews(r)&&(b===undefined||keyedViews(b))){
      const ids=v=>(v||[]).map(entry=>entry.id),common=ids(b).filter(id=>l.some(v=>v.id===id)&&r.some(v=>v.id===id));
      const order=v=>ids(v).filter(id=>common.includes(id)),localOrder=order(l),remoteOrder=order(r);
      const localMoved=canonical(localOrder)!==canonical(common),remoteMoved=canonical(remoteOrder)!==canonical(common);
      if(!(localMoved&&remoteMoved&&canonical(localOrder)!==canonical(remoteOrder))){
        const preferred=localMoved&&!remoteMoved?l:r,other=preferred===l?r:l;
        return [...new Set([...ids(preferred),...ids(other)])].map(id=>merge(b?.find(v=>v.id===id),l.find(v=>v.id===id),r.find(v=>v.id===id),[...path,"@"+id])).filter(v=>v!==undefined);
      }
    }
    if(object(l)&&object(r)&&(object(b)||b===undefined)){
      const result={};
      for(const child of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){
        const value=merge(b?.[child],l[child],r[child],[...path,child]);
        if(value!==undefined)Object.defineProperty(result,child,{value,enumerable:true,writable:true,configurable:true});
      }
      return result;
    }
    conflicts.push({path:[...path],local:clone(l),remote:clone(r),base:clone(b)});
    return clone(l);
  }
  return {document:merge(base,local,remote,[]),conflicts};
}
export function resolveConflict(document,path,value){
  let parent=document;
  for(const key of path.slice(0,-1))parent=Array.isArray(parent)?parent.find(v=>v.id===key.slice(1)):parent[key];
  const key=path.at(-1);
  if(Array.isArray(parent)){
    const index=parent.findIndex(v=>v.id===key.slice(1));
    if(value===undefined){if(index>=0)parent.splice(index,1);}
    else if(index<0)parent.push(clone(value));else parent[index]=clone(value);
  }else if(value===undefined)delete parent[key];
  else Object.defineProperty(parent,key,{value:clone(value),writable:true,configurable:true,enumerable:true});
}
export function validateDocument(document) {
  if(!object(document)||Number(document.schemaVersion)!==11)throw new Error("지원하는 Sien Calendar 데이터 형식이 아닙니다.");
  if(Object.keys(document).length>100000)throw new Error("데이터 항목 수가 너무 많습니다.");
  function checkKeys(value,depth=0){
    if(depth>100)throw new Error("데이터 중첩이 너무 깊습니다.");
    if(value&&typeof value==="object")for(const key of Object.keys(value)){
      if(["__proto__","constructor","prototype"].includes(key))throw new Error("안전하지 않은 데이터 키입니다.");
      checkKeys(value[key],depth+1);
    }
  }
  checkKeys(document);
  for(const [key,value]of Object.entries(document)){
    if(["__proto__","constructor","prototype"].includes(key))throw new Error("안전하지 않은 데이터 키입니다.");
    if(!key.startsWith("item:"))continue;
    // Storage keys are record identities. Legacy history can legitimately have
    // the same logical item ID in a live record and several deletion records.
    if(key.length<=5||!object(value)||typeof value.id!=="string"||!value.id.trim())throw new Error("일정 식별자가 없는 데이터입니다.");
  }
  return document;
}
