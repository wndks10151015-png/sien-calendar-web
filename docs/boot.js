const BUILT_VERSION=new URL(import.meta.url).searchParams.get('v')||'0.1.10';
const DEV=/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
const validVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value);
const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;};
let running=BUILT_VERSION,target=BUILT_VERSION,guard=()=>true,sessionProvider=()=>null,checking,applying=false,ready=false,lastInput=Date.now(),lastAttempt=0,legacy=false,canStart=true,openingRelease;
const expected=sessionStorage.getItem('sien-update-target');if(validVersion(expected)&&newer(expected,target))target=expected;
const pointers=new Set();
guard=()=>{const view=window.calendarApp?.view;return !(view&&(view.pendingDetailItems?.size||view.detailSaveTimer||view.detailSaveInFlight||view.draftPersistTimer||view.inlineSaveQueues?.size||view.draftCompositionActive))&&!['pending','syncing','conflict','error','offline'].includes(document.getElementById('web-sync')?.dataset.state);};
const requestWorker=(worker,data,timeout=2500)=>new Promise(resolve=>{
  if(!worker){resolve(null);return;}
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},timeout);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
  try{worker.postMessage(data,[channel.port2]);}catch{clearTimeout(timer);channel.port1.close();resolve(null);}
});
function release(){
  // Startup may need the manifest before and after mounting; share one lookup, including failures.
  if(openingRelease)return openingRelease;
  openingRelease=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{const response=await fetch('./release.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Release unavailable');const value=await response.json();if(!validVersion(value.version))throw Error('Invalid version');return value.version;}finally{clearTimeout(timer);}
  })();return openingRelease;
}
async function workerVersion(){return(await requestWorker(navigator.serviceWorker?.controller,{type:'VERSION'}))?.version;}
async function install(version){
  const registration=await navigator.serviceWorker.register('./service-worker.js?v='+version,{scope:'./',updateViaCache:'none'});
  if(await workerVersion()===version)return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(Error('Update still downloading')),15000);
    const inspect=async()=>{if(await workerVersion()===version)finish();};
    const worker=registration.installing||registration.waiting;
    const state=()=>{if(worker?.state==='redundant')finish(Error('Incomplete update'));};
    const finish=error=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',inspect);worker?.removeEventListener('statechange',state);error?reject(error):resolve();};
    navigator.serviceWorker.addEventListener('controllerchange',inspect);worker?.addEventListener('statechange',state);void inspect();state();
  });
}
function quiet(){
  const active=document.activeElement;
  return !pointers.size&&Date.now()-lastInput>=1500&&!active?.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')&&!document.querySelector('.modal-container,.sien-detail-modal-layer,.menu');
}
async function apply(){
  if(!ready||applying||!validVersion(target)||target===running||Date.now()-lastAttempt<10000||!quiet())return;
  applying=true;
  let ticket,reloading=false;
  try{
    if(!await guard()||!quiet()||await workerVersion()!==target)return;
    const session=await sessionProvider();
    if(session){const saved=await requestWorker(navigator.serviceWorker.controller,{type:'KEEP_SESSION',session});if(saved?.ticket){ticket=saved.ticket;sessionStorage.setItem('sien-update-session',ticket);}}
    if(!await guard()||!quiet())return;
    sessionStorage.setItem('sien-update-target',target);lastAttempt=Date.now();reloading=true;location.reload();
  }catch{/* A failed update leaves the running calendar intact and retries later. */}
  finally{if(ticket&&!reloading){sessionStorage.removeItem('sien-update-session');void requestWorker(navigator.serviceWorker.controller,{type:'DROP_SESSION',ticket});}applying=false;}
}
async function check(){
  if(DEV||!('serviceWorker'in navigator)||!navigator.onLine)return;
  if(checking)return checking;
  checking=(async()=>{
    const version=await release();if(!newer(version,running)&&version!==target)return;
    if(newer(version,target))target=version;
    if(target===running)return;
    await install(target);await apply();
  })().catch(()=>{}).finally(()=>{checking=null;});
  return checking;
}
window.calendarUpdates={get version(){return running;},get pendingVersion(){return target===running?null:target;},check,setGuard(value){guard=value;},setSessionProvider(value){sessionProvider=value;},forgetSession(){const ticket=sessionStorage.getItem('sien-update-session');sessionStorage.removeItem('sien-update-session');if(ticket)void requestWorker(navigator.serviceWorker?.controller,{type:'DROP_SESSION',ticket});},async takeSession(){
  const ticket=sessionStorage.getItem('sien-update-session');sessionStorage.removeItem('sien-update-session');
  return ticket?await requestWorker(navigator.serviceWorker?.controller,{type:'TAKE_SESSION',ticket}):null;
}};
for(const type of ['input','keydown','wheel'])addEventListener(type,()=>{lastInput=Date.now();},{capture:true,passive:true});
addEventListener('pointerdown',event=>{pointers.add(event.pointerId);lastInput=Date.now();},{capture:true,passive:true});
for(const type of ['pointerup','pointercancel'])addEventListener(type,event=>{pointers.delete(event.pointerId);lastInput=Date.now();},{capture:true,passive:true});
addEventListener('blur',()=>pointers.clear());
if(!DEV&&'serviceWorker'in navigator){
  const current=await workerVersion();
  if(validVersion(current)&&!newer(target,current)){running=target=current;}
  else {
  try{const version=await release();if(newer(version,target))target=version;}catch{}
  try{await install(target);running=target;}catch{
    const active=await workerVersion();
    if(validVersion(active))running=target=active;
    else {
      const prefix='sien-calendar:'+new URL('./',location.href).pathname+':web-';
      const previous=(await caches.keys()).find(key=>key.startsWith(prefix)&&validVersion(key.slice(prefix.length)));
      if(previous){running=previous.slice(prefix.length);legacy=true;}else {canStart=navigator.onLine;if(canStart)running=target;}
    }
  }
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{void workerVersion().then(version=>{if(validVersion(version)&&newer(version,running)){target=version;void apply();}});});
  // This timer only applies an already selected update after editing ends; it never polls the server.
  setInterval(()=>void apply(),1000);
}
document.documentElement.dataset.appVersion=running;
if(canStart){
  try{await import(DEV||legacy?'./app.js':'./app.js?v='+running);ready=true;if(validVersion(expected)&&!newer(expected,running))sessionStorage.removeItem('sien-update-target');void check();}catch(error){const loading=document.querySelector('.web-loading');if(loading)loading.textContent='캘린더를 불러오지 못했습니다. 연결이 복구되면 다시 시도해 주세요.';throw error;}
}else{
  document.querySelector('.web-loading').textContent='업데이트 파일을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요. 저장된 일정은 그대로 보관 중입니다.';
}
