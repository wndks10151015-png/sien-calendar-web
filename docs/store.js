import {canonical} from './merge.js';
const DB_NAME = "sien-calendar-web";
let connection;
export async function database() {
  if (!connection) connection = new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore("state");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error("브라우저 저장소를 열지 못했습니다."));
  });
  return connection;
}
export async function readState(key) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("state","readonly"),request=tx.objectStore("state").get(key);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function writeState(key,value) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("state","readwrite");tx.objectStore("state").put(value,key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function deleteState(key) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("state","readwrite");tx.objectStore("state").delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
export const withLock=(name,operation)=>navigator.locks?navigator.locks.request(name,operation):operation();
export const readDocument=async()=>structuredClone(await readState("document")||{schemaVersion:11});
export async function writeDocument(value,{remote=false}={}) {
  await writeState("document",value);
  notifyDocument(remote);
}
function notifyDocument(remote){
  window.dispatchEvent(new CustomEvent("calendar-document-saved",{detail:{remote}}));
  channel?.postMessage({type:"changed"});
}
export async function saveSyncRecovery(document,reason){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),state=tx.objectStore('state'),request=state.get('sync-recovery');let failure;
    request.onsuccess=()=>{
      try{
      const prior=Array.isArray(request.result)?request.result:[];
      if(prior[0]&&canonical(prior[0].document)===canonical(document))return;
      state.put([{id:crypto.randomUUID(),createdAt:new Date().toISOString(),reason,document:structuredClone(document)},...prior].slice(0,5),'sync-recovery');
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('복구본을 저장하지 못했습니다. 동기화를 중단했습니다.'));
  });
}
export async function commitSyncDocument(expected,next,base,lastSync){
  const db=await database();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),state=tx.objectStore('state'),request=state.get('document');let failure;
    request.onsuccess=()=>{
      try{
        if(canonical(request.result||{schemaVersion:11})!==canonical(expected))throw new Error('저장 중 다른 탭에서 편집했습니다. 변경을 보존하고 다시 동기화해 주세요.');
        state.put(next,'document');state.put(base,'sync-base');state.put(lastSync,'last-sync');
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('동기화 결과를 이 기기에 저장하지 못했습니다.'));
  });
  if(canonical(expected)!==canonical(next))notifyDocument(true);
}
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("sien-calendar-web"):null;
if(channel)channel.onmessage=()=>window.dispatchEvent(new CustomEvent("calendar-other-tab"));
const bytesTo64=bytes=>btoa(String.fromCharCode(...bytes));
const bytesFrom64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function vaultKey(passphrase,salt) {
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:600000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptedCredential(token,passphrase) {
  if(passphrase.length<10)throw new Error("잠금 비밀번호는 10자 이상으로 입력해 주세요.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await vaultKey(passphrase,salt),new TextEncoder().encode(token));
  return {version:1,salt:bytesTo64(salt),iv:bytesTo64(iv),cipher:bytesTo64(new Uint8Array(cipher))};
}
export async function rememberCredential(token,passphrase) {
  await writeState("credential",await encryptedCredential(token,passphrase));
}
export async function saveConnectionCredentials(settings,token,passphrase,current=()=>{}){
  const credential=await encryptedCredential(token,passphrase),db=await database();
  current();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),state=tx.objectStore('state');
    const failure=()=>new Error('로그인을 저장하지 못했습니다. 기기의 저장 공간을 확인해 주세요.');
    try{state.put(settings,'connection');state.put(credential,'credential');}
    catch{tx.abort();reject(failure());return;}
    tx.oncomplete=resolve;tx.onerror=()=>reject(failure());tx.onabort=()=>reject(failure());
  });
}
export async function unlockCredential(passphrase) {
  const entry=await readState("credential");if(!entry)throw new Error("저장된 연결 정보가 없습니다.");
  try {
    const key=await vaultKey(passphrase,bytesFrom64(entry.salt));
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytesFrom64(entry.iv)},key,bytesFrom64(entry.cipher)));
  }catch{throw new Error("잠금 비밀번호가 맞지 않거나 연결 정보가 손상됐습니다.");}
}
