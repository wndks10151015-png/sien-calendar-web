import {readState,writeState,readDocument,withLock,saveSyncRecovery,commitSyncDocument,saveConnectionCredentials} from "./store.js";
import {mergeDocuments,canonical,validateDocument,resolveConflict,isPristineDocument} from "./merge.js";
import {sharedDocument,retainDeviceViewState,withSharedViewModes} from "./view-state.js";

const API="https://api.github.com";
const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const decode=value=>{try{return validateDocument(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,"")),c=>c.charCodeAt(0)))));}catch{throw new Error("원격 일정 데이터를 읽지 못했습니다. 덮어쓰지 않았습니다.");}};
export class GitHubSync extends EventTarget {
  #token="";
  #busy=null;
  #timer=null;
  #settings=null;
  #resolver=null;
  #lastPull=0;
  #retryAt=0;
  #epoch=0;
  #controller=null;
  #connecting=false;
  #dirty=false;
  #changeSerial=0;
  constructor(){
    super();this.status="이 기기에 저장";this.state="local";
    window.addEventListener("calendar-document-saved",e=>{if(!e.detail?.remote){this.#dirty=true;this.#changeSerial++;void this.scheduleSavedDocument().catch(()=>this.schedule());}});
    window.addEventListener("online",()=>this.schedule(500));
    window.addEventListener("focus",()=>this.schedule(700));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)this.schedule(700);});
    setInterval(()=>{if(!document.hidden&&Date.now()-this.#lastPull>60000)this.schedule(100);},30000);
  }
  setStatus(state,text){this.state=state;this.status=text;this.dispatchEvent(new Event("status"));}
  async initialize(){this.#settings=await readState("connection");const base=await readState('sync-base'),local=await readDocument();this.#dirty=base?canonical(sharedDocument(local,base))!==canonical(sharedDocument(base)):!isPristineDocument(sharedDocument(local));return this.#settings;}
  get connected(){return !!this.#token;}
  get busy(){return !!this.#busy||this.#connecting;}
  sessionForUpdate(){return this.#token?{token:this.#token,connection:this.connection}:null;}
  get hasPendingUpload(){return this.#dirty;}
  get connection(){return this.#settings?{...this.#settings}:null;}
  setConflictResolver(resolve){this.#resolver=resolve;}
  async connect({owner,repo,path="calendar.json"},token,{passphrase}={}){
    if(this.#connecting||this.#busy)throw new Error("연결 또는 동기화 확인 중입니다. 완료 후 다시 시도해 주세요.");
    if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)||!/^[A-Za-z0-9._-]{1,100}$/.test(repo))throw new Error("저장소 이름은 소유자/이름 형식으로 입력해 주세요.");
    if(!/^[-A-Za-z0-9_./]+\.json$/.test(path)||path.split("/").some(p=>p===".."||!p))throw new Error("일정 파일 경로가 올바르지 않습니다.");
    if(!token.startsWith("github_pat_")||token.length<30)throw new Error("선택한 비공개 저장소에만 권한이 있는 Fine-grained 토큰을 사용해 주세요.");
    const old=this.#settings,oldToken=this.#token,epoch=++this.#epoch;let verified=false;this.#connecting=true;
    this.#controller?.abort();this.#controller=new AbortController();this.#retryAt=0;
    this.#token=token.trim();this.#settings={owner,repo,path,branch:"main"};
    try{
      const user=await this.request("/user");
      if(String(user.login).toLowerCase()!==owner.toLowerCase())throw new Error("본인 소유의 비공개 일정 저장소만 연결할 수 있습니다.");
      await this.assertPrivate();
      if(old&&(old.owner!==owner||old.repo!==repo||old.path!==path)){
        throw new Error("다른 저장소로 변경하려면 먼저 현재 일정을 내보내고 연결을 해제해 주세요.");
      }
      const current=()=>{if(epoch!==this.#epoch||!this.#token)throw new Error('로그인이 취소됐습니다. 이 기기의 작업은 유지했습니다.');};
      current();
      if(passphrase!==undefined)await saveConnectionCredentials(this.#settings,this.#token,passphrase,current);
      else await writeState("connection",this.#settings);
      verified=true;
      await this.sync({interactive:true});
      if(epoch!==this.#epoch||!this.#token)throw new Error("연결 확인이 취소됐습니다. 이 기기의 작업은 유지했습니다.");
      if(this.state!=="synced")throw new Error(this.state==='conflict'?'연결은 확인했지만 미해결 충돌이 있어 전송하지 않았습니다. 이 기기의 작업과 복구본을 보관했습니다.':'아직 동기화가 완료되지 않았습니다. 이 기기의 작업은 보관 중입니다.');
      return this.connection;
    }catch(error){
      if(epoch===this.#epoch&&!verified){this.#controller?.abort();this.#controller=new AbortController();this.#token=oldToken;this.#settings=old;this.#retryAt=0;this.setStatus(oldToken?'error':'locked',oldToken?'새 토큰 확인 실패 · 기존 연결 유지':'연결 확인 필요');}
      throw error;
    }finally{this.#connecting=false;}
  }
  async unlock(token){if(this.#busy)await this.#busy.catch(()=>{});this.#epoch++;this.#controller?.abort();this.#controller=new AbortController();this.#retryAt=0;this.#token=token;this.#settings=await readState("connection");if(!this.#settings){this.#token='';throw new Error("저장된 연결 정보가 없습니다.");}this.schedule(200);}
  lock(){this.#epoch++;this.#controller?.abort();this.#token="";clearTimeout(this.#timer);this.setStatus("locked","잠김");}
  async scheduleSavedDocument(){
    const serial=this.#changeSerial;
    const base=await readState("sync-base");
    const local=await readDocument();if(serial!==this.#changeSerial)return;this.#dirty=base?canonical(sharedDocument(local,base))!==canonical(sharedDocument(base)):!isPristineDocument(sharedDocument(local));
    if(!this.#token){this.setStatus(this.#settings?'locked':'local',this.#settings?'토큰 재연결 필요 · 기기에 저장':this.#dirty?'미연결 · 이 기기에만 저장':'GitHub 연결');return;}
    if(this.#dirty)this.schedule();
    else if(!this.#busy&&this.state==='pending'&&this.#lastPull)this.setStatus('synced','동기화 완료');
  }
  schedule(delay=1800){
    if(!this.#token)return;
    clearTimeout(this.#timer);this.#timer=setTimeout(()=>void this.sync().catch(()=>{}),delay);
    this.setStatus(navigator.onLine?"pending":"offline",navigator.onLine?"동기화 대기":"오프라인 · 기기에 저장");
  }
  async request(path,options={}){
    if(!path.startsWith("/")||path.startsWith("//"))throw new Error("잘못된 API 경로입니다.");
    if(Date.now()<this.#retryAt)throw new Error("GitHub 요청 한도로 잠시 대기 중입니다.");
    const epoch=this.#epoch,controller=new AbortController(),session=this.#controller,abort=()=>controller.abort();
    session?.signal.addEventListener('abort',abort,{once:true});if(session?.signal.aborted)abort();
    const timer=setTimeout(abort,30000);let response;
    try{
    try{response=await fetch(API+path,{...options,signal:controller.signal,credentials:"omit",cache:"no-store",headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(options.headers||{}),"Authorization":"Bearer "+this.#token}});}
    catch{throw new Error(epoch!==this.#epoch?'동기화를 취소했습니다. 이 기기의 작업은 유지했습니다.':controller.signal.aborted?'네트워크 응답 시간이 초과됐습니다. 이 기기의 변경사항은 보관 중입니다.':"네트워크에 연결하지 못했습니다. 이 기기의 변경사항은 보관 중입니다.");}
    if(epoch!==this.#epoch)throw new Error('연결 상태가 변경되어 이전 요청을 중단했습니다.');
    if(response.status===401){this.#token="";throw new Error("토큰이 만료되었거나 권한이 없습니다. 다시 연결해 주세요.");}
    if(response.status===403||response.status===429){
      if(response.status===403&&response.headers.get('x-ratelimit-remaining')!=='0'&&!response.headers.get('retry-after'))throw new Error('GitHub 저장소와 Contents 읽기·쓰기 권한을 확인해 주세요. 변경사항은 이 기기에 보관 중입니다.');
      const reset=Number(response.headers.get("x-ratelimit-reset"))*1000;
      this.#retryAt=Number.isFinite(reset)&&reset>Date.now()?reset:Date.now()+60000;
      throw new Error("GitHub 권한 또는 요청 한도를 확인해 주세요. 자동 과금은 사용하지 않습니다.");
    }
    if(response.status===409){const e=new Error("다른 기기에서 먼저 저장했습니다.");e.code="CONFLICT";throw e;}
    if(options.allowMissing&&response.status===404)return null;
    if(!response.ok)throw new Error("GitHub 저장소 요청에 실패했습니다. 상태 "+response.status);
    if(response.status===204)return null;
    try{return await response.json();}catch{throw new Error("GitHub 응답을 읽지 못했습니다.");}
    }finally{clearTimeout(timer);session?.signal.removeEventListener('abort',abort);}
  }
  prefix(){return "/repos/"+encodeURIComponent(this.#settings.owner)+"/"+encodeURIComponent(this.#settings.repo);}
  async assertPrivate(){
    const repo=await this.request(this.prefix());
    if(repo.private!==true||repo.visibility==="public")throw new Error("공개 저장소에는 일정을 읽거나 저장하지 않습니다. 비공개 저장소를 선택해 주세요.");
    if(repo.archived)throw new Error("보관된 저장소에는 저장할 수 없습니다.");
    if(repo.permissions?.push===false)throw new Error("일정 저장소의 Contents 쓰기 권한이 필요합니다.");
    this.#settings.branch=repo.default_branch||"main";
  }
  async sync({interactive=false}={}){
    if(this.#busy)return this.#busy;
    if(!this.#token)return;
    if(!navigator.onLine){this.setStatus("offline","오프라인 · 기기에 저장");return;}
    const epoch=this.#epoch,current=()=>{if(epoch!==this.#epoch||!this.#token)throw new Error('연결 상태가 변경되어 동기화를 중단했습니다.');};
    this.#busy=withLock("sien-github-sync",async()=>{
      current();
      this.setStatus("syncing","동기화 중");
      for(let attempt=0;attempt<3;attempt++){
        await this.assertPrivate();
        const path=this.prefix()+"/contents/"+this.#settings.path.split("/").map(encodeURIComponent).join("/");
        const file=await this.request(path+"?ref="+encodeURIComponent(this.#settings.branch),{allowMissing:true});
        if(file&&file.type!=="file")throw new Error("일정 파일이 아닌 경로입니다.");
        if(file?.size>20*1024*1024)throw new Error("원격 일정 파일이 앱의 20MB 한도를 넘어 읽기를 보류했습니다.");
        const remote=file?(file.encoding==="base64"?decode(file.content):validateDocument(await this.request(path+"?ref="+encodeURIComponent(this.#settings.branch),{headers:{Accept:"application/vnd.github.raw+json"}}))):{schemaVersion:11};
        const savedBase=await readState("sync-base"),base=sharedDocument(savedBase||{schemaVersion:11});
        current();
        if(!file&&savedBase)throw new Error('서버 일정 파일을 찾지 못했습니다. 삭제로 처리하지 않고 이 기기의 일정과 동기화 기준본을 유지했습니다.');
        const before=validateDocument(await readDocument()),local=sharedDocument(before,base),remoteShared=sharedDocument(remote);
        const adopting=!savedBase&&file&&isPristineDocument(local);
        if(!savedBase&&!isPristineDocument(local))await saveSyncRecovery(before,'최초 연결 전');
        let merged=adopting?{document:remoteShared,conflicts:[]}:mergeDocuments(base,local,remoteShared);
        if(merged.conflicts.length){
          if(!interactive||!this.#resolver){this.setStatus("conflict","충돌 확인 필요 · 기기에 보관");return;}
          await saveSyncRecovery(before,'충돌 선택 전');current();
          const selected=await this.#resolver(merged.conflicts);
          current();
          if(!selected){this.setStatus("conflict","충돌 확인 필요 · 기기에 보관");return;}
          // User explicitly resolves the conflicting fields; independent edits stay merged.
          for(const [index,conflict]of merged.conflicts.entries()){
            resolveConflict(merged.document,conflict.path,selected[index]==="remote"?conflict.remote:conflict.local);
          }
        }
        current();
        const payload=withSharedViewModes(merged.document,remote,before);
        if(!file||canonical(payload)!==canonical(remote)){
          const content=encode(payload);
          if(content.length>Math.floor(20*1024*1024*4/3))throw new Error("일정 파일이 20MB를 넘어 동기화를 보류했습니다. 내보내기로 보관 후 파일 분할이 필요합니다.");
          try{
            await this.assertPrivate();
            current();
            await this.request(path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Sync calendar",content,branch:this.#settings.branch,...(file?{sha:file.sha}:{})})});
          }catch(error){if(error.code==="CONFLICT")continue;throw error;}
        }
        await withLock("sien-calendar-write",async()=>{
          current();const latest=validateDocument(await readDocument());
          const pending=mergeDocuments(local,sharedDocument(latest,local),merged.document);
          if(pending.conflicts.length)throw new Error("저장 중 추가 편집이 있어 기기의 변경사항을 유지했습니다. 다시 동기화해 주세요.");
          const next=retainDeviceViewState(pending.document,adopting?{}:latest,payload);
          current();await commitSyncDocument(latest,next,merged.document,Date.now());
          if(canonical(pending.document)!==canonical(merged.document))setTimeout(()=>this.schedule(0),0);
        });
        current();this.#lastPull=Date.now();const serial=this.#changeSerial,after=await readDocument();current();
        this.#dirty=serial!==this.#changeSerial||canonical(sharedDocument(after,merged.document))!==canonical(merged.document);
        if(this.#dirty){this.schedule(0);return;}
        this.setStatus("synced","동기화 완료");return;
      }
      throw new Error("동시 편집 충돌이 반복돼 저장을 보류했습니다. 변경사항은 기기에 남아 있습니다.");
    }).catch(error=>{if(epoch===this.#epoch)this.setStatus(this.#token?"error":"locked",error.message);throw error;}).finally(()=>{this.#busy=null;});
    return this.#busy;
  }
}
