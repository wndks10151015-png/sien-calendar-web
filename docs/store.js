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
  window.dispatchEvent(new CustomEvent("calendar-document-saved",{detail:{remote}}));
  channel?.postMessage({type:"changed"});
}
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("sien-calendar-web"):null;
if(channel)channel.onmessage=()=>window.dispatchEvent(new CustomEvent("calendar-other-tab"));
const bytesTo64=bytes=>btoa(String.fromCharCode(...bytes));
const bytesFrom64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function vaultKey(passphrase,salt) {
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:600000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function rememberCredential(token,passphrase) {
  if(passphrase.length<10)throw new Error("잠금 비밀번호는 10자 이상으로 입력해 주세요.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await vaultKey(passphrase,salt),new TextEncoder().encode(token));
  await writeState("credential",{version:1,salt:bytesTo64(salt),iv:bytesTo64(iv),cipher:bytesTo64(new Uint8Array(cipher))});
}
export async function unlockCredential(passphrase) {
  const entry=await readState("credential");if(!entry)throw new Error("저장된 연결 정보가 없습니다.");
  try {
    const key=await vaultKey(passphrase,bytesFrom64(entry.salt));
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytesFrom64(entry.iv)},key,bytesFrom64(entry.cipher)));
  }catch{throw new Error("잠금 비밀번호가 맞지 않거나 연결 정보가 손상됐습니다.");}
}
