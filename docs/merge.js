export const canonical=value=>JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const clone=value=>value===undefined?undefined:structuredClone(value);
export function mergeDocuments(base,local,remote) {
  const conflicts=[];
  function merge(b,l,r,path) {
    if(canonical(l)===canonical(r))return clone(l);
    if(canonical(l)===canonical(b))return clone(r);
    if(canonical(r)===canonical(b))return clone(l);
    const key=path.at(-1);
    if(["updatedAt","_updatedAt","modified","configUpdatedAt","_commitId","commitId"].includes(key)&&[l,r].every(v=>typeof v==="string"))return l>r?l:r;
    if(["revision","_revision","configRevision"].includes(key)&&[l,r].every(Number.isFinite))return Math.max(l,r)+1;
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
