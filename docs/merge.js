export const canonical=value=>JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const clone=value=>value===undefined?undefined:structuredClone(value);
const keyedEntries=(value,key)=>Array.isArray(value)&&value.every(v=>object(v)&&typeof v[key]==='string'&&v[key].length>0)&&new Set(value.map(v=>v[key])).size===value.length;
export function isPristineDocument(document){
  const ignored=new Set(['schemaVersion','migration','updatedAt','_updatedAt','modified','revision','_revision','configUpdatedAt','configRevision','commitId','_commitId']);
  const hasValue=value=>value!=null&&(typeof value==='object'?Array.isArray(value)?value.length>0:Object.values(value).some(hasValue):true);
  return !Object.entries(document).some(([key,value])=>!ignored.has(key)&&(key.startsWith('item:')||hasValue(value)));
}
export function mergeDocuments(base,local,remote) {
  const conflicts=[];
  function merge(b,l,r,path) {
    if(canonical(l)===canonical(r))return clone(l);
    if(canonical(l)===canonical(b))return clone(r);
    if(canonical(r)===canonical(b))return clone(l);
    const key=path.at(-1);
    if(["updatedAt","_updatedAt","modified","configUpdatedAt","_commitId","commitId"].includes(key)&&[l,r].every(v=>typeof v==="string"))return l>r?l:r;
    if(["revision","_revision","configRevision"].includes(key)&&[l,r].every(Number.isFinite))return Math.max(l,r)+1;
    const collectionKey=path.length===2&&path[0]==='config'?(key==='customProperties'?'key':['savedViews','databases','externalCalendars'].includes(key)?'id':null):null;
    if(collectionKey&&keyedEntries(l,collectionKey)&&keyedEntries(r,collectionKey)&&(b===undefined||keyedEntries(b,collectionKey))){
      const ids=v=>(v||[]).map(entry=>entry[collectionKey]),common=ids(b).filter(id=>l.some(v=>v[collectionKey]===id)&&r.some(v=>v[collectionKey]===id));
      const order=v=>ids(v).filter(id=>common.includes(id)),localOrder=order(l),remoteOrder=order(r);
      const localMoved=canonical(localOrder)!==canonical(common),remoteMoved=canonical(remoteOrder)!==canonical(common);
      if(!(localMoved&&remoteMoved&&canonical(localOrder)!==canonical(remoteOrder))){
        const preferred=localMoved&&!remoteMoved?l:r,other=preferred===l?r:l;
        return [...new Set([...ids(preferred),...ids(other)])].map(id=>merge(b?.find(v=>v[collectionKey]===id),l.find(v=>v[collectionKey]===id),r.find(v=>v[collectionKey]===id),[...path,"@"+id])).filter(v=>v!==undefined);
      }
    }
    if(key==='options'&&path[0]==='config'&&path[1]==='customProperties'&&[l,r].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string')&&new Set(a).size===a.length)&&(b===undefined||Array.isArray(b))&&(b||[]).every(v=>l.includes(v)&&r.includes(v))){
      const common=b||[],order=a=>a.filter(v=>common.includes(v)),lo=order(l),ro=order(r);
      if(!(canonical(lo)!==canonical(common)&&canonical(ro)!==canonical(common)&&canonical(lo)!==canonical(ro)))return [...new Set([...r,...l])];
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
  const find=(array,key)=>array.findIndex(v=>v.id===key.slice(1)||v.key===key.slice(1));
  for(const key of path.slice(0,-1))parent=Array.isArray(parent)?parent[find(parent,key)]:parent[key];
  const key=path.at(-1);
  if(Array.isArray(parent)){
    const index=find(parent,key);
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
