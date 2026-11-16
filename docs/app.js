import {SienCalendarPlugin,parseIcsCalendar} from "./calendar-engine.js";
import {createBrowserApp,Modal,Notice,setIcon} from "./host.js";
import {readState,writeState,readDocument,writeDocument,unlockCredential,withLock} from "./store.js";
import {validateDocument} from "./merge.js";
import {GitHubSync} from "./sync.js";
import {pushOverlay,removeOverlay} from "./navigation.js";

const sync=new GitHubSync(),root=document.getElementById("calendar");
let app,plugin,booting;
const mobile=()=>document.body.classList.toggle("is-mobile",innerWidth<600||(innerWidth<=1100&&matchMedia("(pointer:coarse)").matches));
mobile();addEventListener("resize",mobile);
if(localStorage.getItem("sien-theme")==="light"){document.body.classList.replace("theme-dark","theme-light");}
setIcon(document.getElementById("web-theme"),"sun-moon");setIcon(document.getElementById("web-settings"),"settings");
function updateSessionWarning(){const warning=document.getElementById('web-session-warning');if(warning)warning.hidden=!plugin||!sync.connection||sync.connected;}
sync.addEventListener("status",()=>{document.getElementById("web-sync-label").textContent=sync.status;const button=document.getElementById("web-sync");button.dataset.state=sync.state;button.title=sync.status;updateSessionWarning();});
async function refresh(){if(plugin)await plugin.onExternalSettingsChange();}
addEventListener("calendar-document-saved",event=>{if(event.detail?.remote)void refresh();});
addEventListener("calendar-other-tab",()=>void refresh());
async function startCalendar(){
  if(booting)return booting;if(plugin)return refresh();
  booting=(async()=>{
    root.replaceChildren();app=createBrowserApp(root);await app.ready;
    plugin=new SienCalendarPlugin(app,{id:"sien-calendar",version:"4.26.42-web.1",dir:"."});
    const refreshExternal=plugin.refreshExternalCalendarNow.bind(plugin);
    plugin.refreshExternalCalendarNow=(id,...args)=>{
      const source=plugin.config?.externalCalendars?.find(c=>c.id===id);
      if(source?.url?.startsWith("https://sien-calendar-file.invalid/"))return Promise.resolve({ok:true,eventCount:plugin.externalCalendarCache?.[id]?.events?.length||0,manual:true});
      return refreshExternal(id,...args);
    };
    const mutate=plugin.mutateInternalData.bind(plugin);
    plugin.mutateInternalData=(...args)=>withLock("sien-calendar-write",()=>mutate(...args));
    await plugin.load();await plugin.openCalendar();
    const view=app.workspace.getLeavesOfType("sien-calendar-view")[0]?.view;
    if(view){
      let detailEntry=null;
      const reconcile=()=>queueMicrotask(()=>{
        const visible=!!view.contentEl.querySelector(".sien-detail-modal-layer");
        if(visible&&!detailEntry)detailEntry=pushOverlay(()=>{detailEntry=null;view.closeDetails();});
        else if(!visible&&detailEntry){removeOverlay(detailEntry);detailEntry=null;}
      });
      for(const method of ["mountDetailLayer","removeDetailLayer","render"]){const original=view[method].bind(view);view[method]=(...args)=>{const result=original(...args);reconcile();return result;};}
    }
    // The browser app is the only host: expose app state, never credentials, for diagnostics.
    window.calendarApp={app,plugin,get view(){return app.workspace.getLeavesOfType("sien-calendar-view")[0]?.view;}};
    const requestDate=new URL(location.href).searchParams.get("date");
    if(requestDate)await plugin.openMonthFromWidget({date:requestDate});
    updateSessionWarning();document.dispatchEvent(new Event("sien-ready"));
  })().catch(error=>{root.replaceChildren();root.createDiv({cls:"web-locked",text:"캘린더를 열지 못했습니다. 새로고침 후 다시 시도해 주세요."});new Notice(error.message);throw error;}).finally(()=>{booting=null;});
  return booting;
}
function dialog(title){
  const modal=new Modal(app||{scope:null});modal.contentEl.classList.add("web-dialog");modal.contentEl.createEl("h2",{text:title});return modal;
}
function field(parent,label,type="text",value=""){
  const wrapper=parent.createEl("label",{cls:"web-field"});wrapper.createSpan({text:label});
  return wrapper.createEl("input",{type,value,attr:{"aria-label":label,autocomplete:type==="password"?"off":"on",spellcheck:"false"}});
}
function button(parent,text,action,primary=false){const b=parent.createEl("button",{text,cls:primary?"mod-cta":"",attr:{type:"button"}});b.addEventListener("click",action);return b;}
function downloadData(data,name){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function exportData(){downloadData(await readDocument(),"sien-calendar-"+new Date().toISOString().slice(0,10)+".json");}
async function exportRecovery(){
  const entries=await readState('sync-recovery')||[],modal=dialog('동기화 전 복구본');
  modal.contentEl.createEl('p',{text:'이 브라우저에만 보관한 최근 복구본입니다. 일정 데이터만 포함하며 토큰은 포함하지 않습니다. 내보내기는 현재 일정이나 서버를 변경하지 않습니다.'});
  for(const entry of entries){const row=modal.contentEl.createDiv({cls:'web-conflict-row'}),count=Object.keys(entry.document).filter(k=>k.startsWith('item:')).length,project=entry.document.config?.customProperties?.find(p=>p.key===entry.document.config?.projectPropertyKey);row.createDiv({text:new Date(entry.createdAt).toLocaleString()+' · '+entry.reason+' · '+count+'개 레코드 · '+(project?.options?.length||0)+'개 프로젝트'});button(row,'이 복구본 내보내기',()=>downloadData(entry.document,'sien-calendar-recovery-'+entry.createdAt.replaceAll(/[:.]/g,'-')+'.json'));}
  button(modal.contentEl.createDiv({cls:'web-actions'}),'닫기',()=>modal.close());modal.open();
}
function importData(){
  const input=document.createElement("input");input.type="file";input.accept=".json,application/json";
  input.addEventListener("change",async()=>{
    const file=input.files[0];if(!file)return;
    try{
      if(file.size>20*1024*1024)throw new Error("20MB 이하의 일정 파일을 선택해 주세요.");
      const data=validateDocument(JSON.parse(await file.text())),items=Object.entries(data).filter(([key])=>key.startsWith("item:"));
      const modal=dialog("일정 가져오기");modal.contentEl.createEl("p",{text:"이 기기의 일정을 선택한 파일로 교체합니다. 원본 Obsidian 파일은 변경하지 않습니다. 연결된 저장소가 있으면 다음 동기화에서 충돌 검사를 거칩니다."});modal.contentEl.createDiv({text:"저장 레코드 "+items.length+"개 · 삭제 이력 "+items.filter(([,v])=>v.deletedAt).length+"개 보존"});
      const actions=modal.contentEl.createDiv({cls:"web-actions"});button(actions,"취소",()=>modal.close());button(actions,"가져오기",async()=>{await withLock("sien-calendar-write",()=>writeDocument(data));await startCalendar();await refresh();modal.close();new Notice("일정을 가져왔습니다.");},true);modal.open();
    }catch{new Notice("올바른 Sien Calendar JSON 파일인지 확인해 주세요. 기존 일정은 변경하지 않았습니다.");}
  });input.click();
}
function importIcs(){
  if(!plugin)return;
  const modal=dialog("ICS 파일 가져오기");
  modal.contentEl.createEl("p",{text:"브라우저에서 직접 불러올 수 없는 iCal은 내려받은 ICS 파일로 추가할 수 있습니다. 일반 일정·공휴일 표시 규칙과 색상은 모든 뷰에 동일하게 적용됩니다. 파일은 자동 갱신되지 않습니다."});
  const sourceLabel=modal.contentEl.createEl("label",{cls:"web-field"});sourceLabel.createSpan({text:"대상 캘린더"});
  const source=sourceLabel.createEl("select",{attr:{"aria-label":"대상 캘린더"}});source.createEl("option",{text:"새 파일 캘린더",value:""});
  for(const entry of plugin.config.externalCalendars||[])source.createEl("option",{text:entry.name,value:entry.id});
  const name=field(modal.contentEl,"이름","text","파일 캘린더"),color=field(modal.contentEl,"색상","color","#8b80df");
  const modeLabel=modal.contentEl.createEl("label",{cls:"web-field"});modeLabel.createSpan({text:"표시 방식"});const mode=modeLabel.createEl("select",{attr:{"aria-label":"표시 방식"}});
  mode.createEl("option",{text:"일반 일정",value:"event"});mode.createEl("option",{text:"공휴일 밑줄",value:"holiday"});
  source.addEventListener("change",()=>{const selected=plugin.config.externalCalendars.find(c=>c.id===source.value);if(selected){name.value=selected.name;color.value=selected.color;mode.value=selected.displayMode;}});
  const input=modal.contentEl.createEl("input",{type:"file",attr:{accept:".ics,text/calendar","aria-label":"ICS 파일"}}),error=modal.contentEl.createDiv({cls:"web-error",attr:{role:"alert"}});
  const actions=modal.contentEl.createDiv({cls:"web-actions"});button(actions,"취소",()=>modal.close());
  const apply=button(actions,"가져오기",async()=>{
    error.textContent="";apply.disabled=true;
    try{
      const file=input.files?.[0];if(!file||file.size>10*1024*1024)throw new Error("10MB 이하의 ICS 파일을 선택해 주세요.");
      const text=await file.text();if(!/(?:^|\n)BEGIN:VCALENDAR(?:\r?\n|$)/i.test(text))throw new Error("올바른 ICS 캘린더 파일이 아닙니다.");
      const events=parseIcsCalendar(text),id=source.value||"file-"+crypto.randomUUID(),now=Date.now();
      const result=await plugin.mutateExternalCalendars((config,cache)=>{
        let entry=config.externalCalendars.find(c=>c.id===id);
        if(source.value&&!entry)return {changed:false,result:false};
        if(!entry){entry={id,name:"",color:"",enabled:true,provider:"ical",url:"https://sien-calendar-file.invalid/"+id+".ics",createdAt:new Date().toISOString()};config.externalCalendars.push(entry);}
        Object.assign(entry,{name:name.value.trim()||file.name,color:color.value,displayMode:mode.value,updatedAt:new Date().toISOString()});
        cache[id]={events,refreshedAt:now,lastAttemptAt:now,etag:"",lastModified:"",lastError:""};
        return {changed:true,result:true};
      });
      if(!result)throw new Error("대상 캘린더가 변경되어 저장하지 않았습니다.");
      plugin.refreshViews();modal.close();new Notice("ICS 일정 "+events.length+"개를 가져왔습니다.");
    }catch(e){error.textContent=e.message;}finally{apply.disabled=false;}
  },true);modal.open();
}
async function connectionDialog({reset=false}={}){
  const stored=await sync.initialize(),vault=await readState("credential"),modal=dialog("기기 동기화");
  modal.contentEl.createEl("p",{text:"GitHub Free의 비공개 일정 저장소에 직접 연결합니다. GPT 계정은 필요하지 않습니다. 토큰은 공개 코드나 일정 파일로 전송하지 않습니다."});
  const status=modal.contentEl.createDiv({cls:"web-status",text:sync.status});
  let syncNow,recoveryButton;
  const updateStatus=()=>{status.textContent=sync.status;if(syncNow)syncNow.hidden=!sync.connected;};
  const updateRecovery=async()=>{if(recoveryButton)recoveryButton.hidden=!(await readState('sync-recovery'))?.length;};
  sync.addEventListener('status',updateStatus);modal.onClose=()=>sync.removeEventListener('status',updateStatus);
  if(vault&&!sync.connected&&!reset){
    const password=field(modal.contentEl,"이 기기의 잠금 비밀번호","password");
    const error=modal.contentEl.createDiv({cls:"web-error",attr:{role:"alert"}}),actions=modal.contentEl.createDiv({cls:"web-actions"});
    const unlock=button(actions,"잠금 해제",async()=>{
      unlock.disabled=true;error.textContent="";
      try{await sync.unlock(await unlockCredential(password.value));password.value="";await startCalendar();modal.close();}
      catch(e){error.textContent=e.message;}finally{unlock.disabled=false;}
    },true);
    password.addEventListener("keydown",e=>{if(e.key==="Enter")unlock.click();});
    button(actions,"다른 토큰으로 로그인",()=>{modal.close();void connectionDialog({reset:true});});
  }else{
    const owner=field(modal.contentEl,"GitHub 소유자","text",stored?.owner||"wndks10151015-png"),repo=field(modal.contentEl,"비공개 일정 저장소 이름","text",stored?.repo||"sien-calendar-data"),token=field(modal.contentEl,"Fine-grained 접근 토큰","password");
    token.autocomplete="off";
    const note=modal.contentEl.createEl("p");note.append("GitHub에서 일정 저장소 하나만 선택하고 Contents 읽기·쓰기 권한만 허용하세요. ");
    note.createEl("a",{text:"토큰 설정 열기",href:"https://github.com/settings/personal-access-tokens/new",attr:{target:"_blank",rel:"noopener noreferrer"}});
    modal.contentEl.createEl('p',{text:'로그인은 이 기기에 암호화해 유지합니다. 다음에는 토큰을 다시 입력하지 않고 아래 비밀번호로 잠금만 해제합니다.'});
    const password=field(modal.contentEl,"기기 잠금 비밀번호 · 10자 이상","password");
    const error=modal.contentEl.createDiv({cls:"web-error",attr:{role:"alert"}}),actions=modal.contentEl.createDiv({cls:"web-actions"});
    const connect=button(actions,sync.connected?"연결 갱신":"로그인",async()=>{
      connect.disabled=true;error.textContent="";
      try{
        if(password.value.length<10)throw new Error("잠금 비밀번호를 10자 이상 입력해 주세요.");
        const secret=token.value.trim();await sync.connect({owner:owner.value.trim(),repo:repo.value.trim()},secret,{passphrase:password.value});
        token.value="";password.value="";await startCalendar();await refresh();modal.close();
      }catch(e){error.textContent=e.message;await updateRecovery();}finally{connect.disabled=false;}
    },true);
    for(const input of [token,password])input.addEventListener('keydown',event=>{if(event.key==='Enter')connect.click();});
    syncNow=button(actions,"지금 동기화",async()=>{try{await sync.sync({interactive:true});status.textContent=sync.status;await updateRecovery();}catch(e){error.textContent=e.message;}});syncNow.hidden=!sync.connected;
  }
  const extra=modal.contentEl.createDiv({cls:"web-secondary-actions"});
  button(extra,"일정 내보내기",exportData);button(extra,"JSON 가져오기",importData);if(plugin)button(extra,"ICS 가져오기",importIcs);
  recoveryButton=button(extra,'복구본 내보내기',()=>void exportRecovery());await updateRecovery();
  if(plugin)button(extra,"토큰 잠금",()=>{sync.lock();modal.close();location.reload();});
  modal.open();
}
sync.setConflictResolver(conflicts=>new Promise(resolve=>{
  const modal=dialog("동시 편집 확인"),choices=[];let decided=false;
  modal.contentEl.createEl("p",{text:"두 기기의 값이 다릅니다. 선택 전에는 원격 일정을 덮어쓰지 않으며 이 기기의 선택 전 복구본을 보관했습니다. 전체 값을 확인한 뒤 선택해 주세요."});
  conflicts.forEach((conflict,index)=>{
    const row=modal.contentEl.createDiv({cls:"web-conflict-row"});row.createEl("strong",{text:conflict.path.join(" / ")});
    for(const [value,label,data]of [["local","이 기기의 변경",conflict.local],["remote","원격 기기의 변경",conflict.remote]]){
      const full=data===undefined?'삭제됨':JSON.stringify(data,null,2),l=row.createEl("label"),radio=l.createEl("input",{type:"radio",attr:{name:"conflict-"+index,value}});radio.checked=value==="local";l.createSpan({text:label+": "+(full.length>150?full.slice(0,150)+'…':full)});if(full.length>150){const details=row.createEl('details');details.createEl('summary',{text:label+' 전체 값 보기'});details.createEl('pre',{text:full,cls:'web-conflict-value'});}if(value==="local")choices.push(radio);
    }
  });
  const actions=modal.contentEl.createDiv({cls:"web-actions"});button(actions,"나중에",()=>modal.close());button(actions,"선택한 값으로 병합",()=>{decided=true;resolve(choices.map(r=>r.checked?"local":"remote"));modal.close();},true);
  modal.onClose=()=>{if(!decided)resolve(null);};modal.open();
}));
document.getElementById("web-sync").addEventListener("click",()=>void connectionDialog());
document.getElementById('web-reconnect')?.addEventListener('click',()=>void connectionDialog());
document.getElementById("web-theme").addEventListener("click",()=>{const light=document.body.classList.contains("theme-dark");document.body.classList.toggle("theme-dark",!light);document.body.classList.toggle("theme-light",light);localStorage.setItem("sien-theme",light?"light":"dark");document.getElementById("web-theme").setAttribute("aria-label",light?"어두운 테마로 변경":"밝은 테마로 변경");});
document.getElementById("web-settings").addEventListener("click",()=>{if(!plugin)return;const modal=dialog("캘린더 설정");app.settingTab.containerEl=modal.contentEl.createDiv();app.settingTab.display();modal.open();});
addEventListener('beforeunload',event=>{
  const view=window.calendarApp?.view,editorPending=view&&(view.pendingDetailItems?.size||view.detailSaveTimer||view.detailSaveInFlight||view.draftPersistTimer||view.inlineSaveQueues?.size);
  if(editorPending||sync.connection&&sync.hasPendingUpload){event.preventDefault();event.returnValue='';}
});
addEventListener("pagehide",()=>{void plugin?.flushOpenDetailSaves().catch(()=>{});});
if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
const settings=await sync.initialize(),vault=await readState("credential");
sync.setStatus(settings?"locked":"local",settings&&vault?"잠금 해제":settings?'다시 로그인 필요 · 기기에 저장':sync.hasPendingUpload?'미연결 · 이 기기에만 저장':"GitHub 연결");
if(settings&&vault){
  root.replaceChildren();const lock=root.createDiv({cls:"web-locked"}),content=lock.createDiv();content.createEl("p",{text:"저장된 캘린더 연결을 잠금 해제해 주세요."});button(content,"잠금 해제",()=>void connectionDialog(),true);void connectionDialog();
}else {await startCalendar();if(settings)void connectionDialog();}
if("serviceWorker" in navigator&&!location.hostname.match(/^(127\.0\.0\.1|localhost)$/))navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(()=>new Notice("오프라인 앱 캐시를 준비하지 못했습니다. 온라인 상태에서 다시 열어 주세요."));
