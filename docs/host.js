import {readDocument,writeDocument,readState,writeState} from "./store.js";
import {pushOverlay,removeOverlay} from "./navigation.js";

function element(parent,tag,options={},callback){
  const node=(parent.ownerDocument||document).createElement(tag);parent.append(node);
  if(typeof options==="string")node.className=options;
  else {
    if(options.cls)node.className=Array.isArray(options.cls)?options.cls.join(" "):options.cls;
    if(options.text!==undefined)node.textContent=String(options.text);
    for(const [key,value]of Object.entries(options.attr||{}))if(value!==null&&value!==undefined)node.setAttribute(key,String(value));
    for(const key of ["type","value","title","placeholder","href"])if(options[key]!==undefined)node[key]=options[key];
    if(options.parent)options.parent.append(node);
  }
  callback?.(node);return node;
}
const methods={
  createEl(tag,options,callback){return element(this,tag,options,callback);},
  createDiv(options,callback){return element(this,"div",options,callback);},
  createSpan(options,callback){return element(this,"span",options,callback);},
  createSvg(tag,options={}){const e=document.createElementNS("http://www.w3.org/2000/svg",tag);this.append(e);for(const[k,v]of Object.entries(options.attr||{}))e.setAttribute(k,v);if(options.cls)e.setAttribute("class",options.cls);return e;},
  empty(){this.replaceChildren();return this;},
  setText(text){this.textContent=text??"";return this;},
  addClass(...names){this.classList.add(...names.flatMap(n=>String(n).split(/\s+/)).filter(Boolean));return this;},
  removeClass(...names){this.classList.remove(...names.flatMap(n=>String(n).split(/\s+/)).filter(Boolean));return this;},
  toggleClass(name,on){this.classList.toggle(name,on);return this;},
  hasClass(name){return this.classList.contains(name);},
  setAttr(name,value){if(value===null||value===undefined)this.removeAttribute(name);else this.setAttribute(name,String(value));return this;},
  getAttr(name){return this.getAttribute(name);},
  setAttrs(attributes){for(const [k,v]of Object.entries(attributes))this.setAttr(k,v);return this;},
  setCssStyles(styles){Object.assign(this.style,styles);return this;},
  setCssProps(props){for(const[k,v]of Object.entries(props))this.style.setProperty(k,String(v));return this;},
  show(){this.hidden=false;this.style.removeProperty("display");return this;},
  hide(){this.hidden=true;return this;},
  toggle(on){on?this.show():this.hide();return this;},
  detach(){this.remove();},
  find(selector){return this.querySelector(selector);},
  findAll(selector){return [...this.querySelectorAll(selector)];},
  findAllSelf(selector){return [...(this.matches(selector)?[this]:[]),...this.querySelectorAll(selector)];},
  matchParent(selector){return this.closest(selector);},
  instanceOf(Type){return this instanceof Type;},
};
for(const prototype of [Element.prototype,DocumentFragment.prototype])for(const[name,method]of Object.entries(methods))if(!prototype[name])Object.defineProperty(prototype,name,{value:method,configurable:true});
if(!Array.prototype.remove)Object.defineProperty(Array.prototype,"remove",{value:function(value){const i=this.indexOf(value);if(i>=0)this.splice(i,1);return this;},configurable:true});
if(!Array.prototype.last)Object.defineProperty(Array.prototype,"last",{value:function(){return this.at(-1);},configurable:true});
if(!Array.prototype.first)Object.defineProperty(Array.prototype,"first",{value:function(){return this[0];},configurable:true});
if(!Array.prototype.unique)Object.defineProperty(Array.prototype,"unique",{value:function(){return [...new Set(this)];},configurable:true});
for(const name of ["activeDocument","activeWindow"])if(!(name in window))Object.defineProperty(window,name,{get:()=>name==="activeDocument"?document:window,configurable:true});

export function setIcon(parent,name){
  parent.replaceChildren();const pascal=String(name||"circle").replace(/(^|-)(\w)/g,(_,dash,c)=>c.toUpperCase());
  const data=window.lucide?.icons?.[pascal]||window.lucide?.icons?.Circle;
  if(data&&window.lucide?.createElement){const svg=window.lucide.createElement(data,{width:18,height:18,"stroke-width":1.7,"aria-hidden":"true"});svg.classList.add("svg-icon");parent.append(svg);}
}
export class Notice{
  constructor(message,duration=4500){this.noticeEl=document.getElementById("notices").createDiv({cls:"notice",text:String(message)});if(duration!==0)this.timer=setTimeout(()=>this.hide(),duration);}
  hide(){clearTimeout(this.timer);this.noticeEl.remove();}
  setMessage(message){this.noticeEl.textContent=message;}
}
class Component{
  constructor(){this.cleanups=[];this.children=[];}
  register(cleanup){this.cleanups.push(cleanup);return cleanup;}
  registerEvent(event){this.register(()=>event?.off?.());return event;}
  registerDomEvent(target,event,handler,options){target.addEventListener(event,handler,options);this.register(()=>target.removeEventListener(event,handler,options));}
  registerInterval(timer){this.register(()=>clearInterval(timer));return timer;}
  addChild(child){this.children.push(child);child.load?.();return child;}
  removeChild(child){child.unload?.();this.children=this.children.filter(c=>c!==child);}
  load(){if(this._loaded)return;this._loaded=true;return this.onload?.();}
  unload(){if(!this._loaded)return;this._loaded=false;this.onunload?.();for(const c of this.children)c.unload?.();for(const cleanup of this.cleanups.splice(0).reverse())try{cleanup();}catch{}}
}
export class Scope{
  constructor(parent){this.parent=parent;this.handlers=[];}
  register(modifiers,key,func){const event={modifiers,key,func};this.handlers.push(event);return event;}
  unregister(event){this.handlers=this.handlers.filter(h=>h!==event);}
}
export class Plugin extends Component{
  constructor(app,manifest){super();this.app=app;this.manifest=manifest;}
  loadData(){return readDocument();}
  saveData(data){return writeDocument(data);}
  registerView(type,create){this.app.views.set(type,create);}
  registerObsidianProtocolHandler(name,handler){this.app.protocols.set(name,handler);}
  addCommand(command){this.app.commands.commands[command.id]=command;}
  addRibbonIcon(){return document.createElement("button");}
  addSettingTab(tab){this.app.settingTab=tab;}
}
export class ItemView extends Component{
  constructor(leaf){super();this.leaf=leaf;this.app=leaf.app;this.containerEl=leaf.containerEl;this.contentEl=leaf.contentEl;this.scope=new Scope();}
  getState(){return this.state||{};}
  async setState(state){this.state=state;}
}
const modalStack=[];
export class Modal{
  constructor(app){
    this.app=app;this.scope=new Scope(app.scope);
    this.containerEl=document.createElement("div");this.containerEl.className="modal-container";
    this.backgroundEl=this.containerEl.createDiv({cls:"modal-bg"});
    this.modalEl=this.containerEl.createDiv({cls:"modal",attr:{role:"dialog","aria-modal":"true"}});
    this.closeButtonEl=this.modalEl.createEl("button",{cls:"modal-close-button",attr:{type:"button","aria-label":"닫기"}});setIcon(this.closeButtonEl,"x");
    this.titleEl=this.modalEl.createDiv({cls:"modal-title"});this.contentEl=this.modalEl.createDiv({cls:"modal-content"});
    this.closeButtonEl.addEventListener("click",()=>this.close());this.backgroundEl.addEventListener("pointerdown",()=>this.close());
    this.key=e=>{
      if(modalStack.at(-1)!==this)return;
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();this.close();return;}
      if(e.key==="Tab"){
        const all=[...this.modalEl.querySelectorAll("button,input,select,textarea,a[href],[tabindex]")].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);
        if(!all.length)return;const first=all[0],last=all.at(-1);
        if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
        else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
      }
    };
  }
  setTitle(value){this.titleEl.textContent=value;return this;}
  open(){if(this.opened)return;this.opened=true;this.previousFocus=document.activeElement;this.navigation=pushOverlay(()=>this.close());document.body.append(this.containerEl);modalStack.push(this);document.addEventListener("keydown",this.key);this.onOpen?.();queueMicrotask(()=>this.contentEl.querySelector("input,button,select,textarea")?.focus({preventScroll:true}));return this;}
  close(){if(!this.opened)return;this.opened=false;this.onClose?.();document.removeEventListener("keydown",this.key);this.containerEl.remove();modalStack.splice(modalStack.indexOf(this),1);this.previousFocus?.isConnected&&this.previousFocus.focus?.({preventScroll:true});removeOverlay(this.navigation);}
}
const menuStack=[];
class MenuItem{
  constructor(menu){this.menu=menu;this.dom=menu.dom.createEl("button",{cls:"menu-item",attr:{type:"button",role:"menuitem"}});this.icon=this.dom.createSpan({cls:"menu-item-icon"});this.titleEl=this.dom.createSpan({cls:"menu-item-title"});}
  setTitle(title){this.titleEl.textContent=title;return this;}
  setIcon(icon){setIcon(this.icon,icon);return this;}
  setDisabled(disabled){this.dom.disabled=disabled;return this;}
  setChecked(checked){this.dom.classList.toggle("is-checked",checked);return this;}
  setWarning(warning=true){this.dom.classList.toggle("is-warning",warning);return this;}
  setSection(){return this;}
  setSubmenu(){const sub=new Menu();this.dom.addEventListener("click",e=>{e.stopPropagation();const r=this.dom.getBoundingClientRect();sub.showAtPosition({x:r.right,y:r.top});});return sub;}
  onClick(handler){this.dom.addEventListener("click",async event=>{if(this.dom.disabled)return;this.menu.hide();await handler(event);});return this;}
}
export class Menu{
  constructor(){this.dom=document.createElement("div");this.dom.className="menu";this.dom.setAttribute("role","menu");this.items=[];this.win=window;this.hideCallbacks=[];}
  addItem(callback){const item=new MenuItem(this);this.items.push(item);callback(item);return this;}
  addSeparator(){this.dom.createDiv({cls:"menu-separator",attr:{role:"separator"}});return this;}
  onHide(callback){this.hideCallbacks.push(callback);return this;}
  showAtMouseEvent(event){return this.showAtPosition({x:event.clientX,y:event.clientY});}
  showAtPosition({x=0,y=0}={}){
    document.body.append(this.dom);menuStack.push(this);
    this.navigation=pushOverlay(()=>this.hide());
    const r=this.dom.getBoundingClientRect();this.dom.style.left=Math.max(6,Math.min(x,innerWidth-r.width-6))+"px";this.dom.style.top=Math.max(6,Math.min(y,innerHeight-r.height-6))+"px";
    this.outside=e=>{if(!this.dom.contains(e.target))this.hide();};
    this.key=e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();this.hide();}};
    // Arm after the opening gesture has completed, without blocking subsequent port touches.
    queueMicrotask(()=>{if(!this.dom.isConnected)return;document.addEventListener("pointerdown",this.outside,true);document.addEventListener("keydown",this.key,true);});
    return this;
  }
  hide(){if(!this.dom.isConnected)return;this.dom.remove();document.removeEventListener("pointerdown",this.outside,true);document.removeEventListener("keydown",this.key,true);menuStack.splice(menuStack.indexOf(this),1);removeOverlay(this.navigation);for(const callback of this.hideCallbacks.splice(0))callback();}
  static hideAll(){for(const menu of [...menuStack])menu.hide();}
}
function control(parent,type){
  const el=parent.createEl(type==="textarea"?"textarea":type==="dropdown"?"select":type==="button"?"button":"input",{attr:{type:type==="toggle"?"checkbox":type==="slider"?"range":type==="button"?"button":"text"}});
  const api={inputEl:el,selectEl:el,buttonEl:el,sliderEl:el,toggleEl:el,extraSettingsEl:el,
    setValue(v){if(type==="toggle")el.checked=!!v;else el.value=v;return api;},
    getValue(){return type==="toggle"?el.checked:el.value;},
    setPlaceholder(v){el.placeholder=v;return api;},
    setButtonText(v){el.textContent=v;return api;},setCta(){el.classList.add("mod-cta");return api;},
    setIcon(v){setIcon(el,v);return api;},setTooltip(v){el.title=v;el.setAttribute("aria-label",v);return api;},
    setDisabled(v){el.disabled=v;return api;},setLimits(min,max,step){Object.assign(el,{min,max,step});return api;},setDynamicTooltip(){return api;},
    addOption(value,text){el.createEl("option",{value,text});return api;},addOptions(values){for(const[v,t]of Object.entries(values))api.addOption(v,t);return api;},
    onChange(fn){el.addEventListener(type==="dropdown"||type==="toggle"?"change":"input",()=>fn(api.getValue()));return api;},
    onClick(fn){el.addEventListener("click",fn);return api;},
  };return api;
}
export class Setting{
  constructor(parent){this.settingEl=parent.createDiv({cls:"setting-item"});this.infoEl=this.settingEl.createDiv({cls:"setting-item-info"});this.nameEl=this.infoEl.createDiv({cls:"setting-item-name"});this.descEl=this.infoEl.createDiv({cls:"setting-item-description"});this.controlEl=this.settingEl.createDiv({cls:"setting-item-control"});}
  setName(v){this.nameEl.textContent=v;return this;}setDesc(v){this.descEl.textContent=v;return this;}
  setHeading(){this.settingEl.classList.add("is-heading");return this;}
  setClass(v){this.settingEl.classList.add(v);return this;}setDisabled(v){for(const e of this.controlEl.children)e.disabled=v;return this;}
}
for(const[method,type]of Object.entries({addText:"text",addTextArea:"textarea",addSearch:"search",addDropdown:"dropdown",addToggle:"toggle",addSlider:"slider",addButton:"button",addExtraButton:"button"}))Setting.prototype[method]=function(callback){callback(control(this.controlEl,type));return this;};
export class PluginSettingTab{constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl=document.createElement("div");}}
export class FuzzySuggestModal extends Modal{
  onOpen(){const input=this.contentEl.createEl("input",{type:"search",attr:{"aria-label":"검색"}}),list=this.contentEl.createDiv({cls:"suggestion-container"});const render=()=>{list.empty();for(const item of this.getItems().filter(i=>this.getItemText(i).toLowerCase().includes(input.value.toLowerCase())).slice(0,200)){const button=list.createEl("button",{text:this.getItemText(item),attr:{type:"button"}});button.addEventListener("click",e=>{this.onChooseItem(item,e);this.close();});}};input.addEventListener("input",render);render();}
  setPlaceholder(value){this.placeholder=value;}
}
export class TFile{constructor(path){this.path=path;this.name=path.split("/").at(-1);this.extension=this.name.split(".").at(-1);this.basename=this.name.replace(/\.[^.]+$/,"");this.stat={mtime:Date.now(),ctime:Date.now(),size:0};}}
export class TFolder{constructor(path){this.path=path;this.children=[];}}
export const normalizePath=value=>String(value).replace(/\\/g,"/").replace(/^\/+|\/+$/g,"");
export function parseYaml(text){try{return JSON.parse(text);}catch{throw new Error("브라우저에서는 JSON 데이터 가져오기를 사용해 주세요.");}}
export async function requestUrl({url,method="GET",headers={},body,throw:shouldThrow=true}){
  const parsed=new URL(url);
  if(parsed.protocol!=="https:")throw new Error("외부 캘린더는 HTTPS 주소만 사용할 수 있습니다.");
  let response;try{response=await fetch(parsed,{method,headers,body,credentials:"omit",cache:"no-store"});}catch{throw new Error("웹에서 이 주소를 직접 불러올 수 없습니다. CORS 허용 여부를 확인하거나 ICS 파일 가져오기를 사용해 주세요.");}
  if(shouldThrow&&response.status>=400)throw new Error("외부 서비스 응답 오류: "+response.status);
  const text=await response.text();return {status:response.status,headers:Object.fromEntries(response.headers),text,get json(){return JSON.parse(text);}};
}
class Emitter{
  constructor(){this.events=new Map();}
  on(name,callback){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(callback);return {off:()=>this.events.get(name)?.delete(callback)};}
  trigger(name,...args){for(const callback of this.events.get(name)||[])callback(...args);}
}
export function createBrowserApp(root){
  const workspace=new Emitter(),vault=new Emitter(),files=new Map(),scopes=[],app={workspace,vault,views:new Map(),protocols:new Map(),scope:new Scope(),commands:{commands:{}},keymap:{pushScope(scope){scopes.push(scope);},popScope(scope){const index=scopes.lastIndexOf(scope);if(index>=0)scopes.splice(index,1);}},get isMobile(){return document.body.classList.contains("is-mobile");},supportsAttachments:false};
  document.addEventListener("keydown",event=>{
    for(const scope of [...scopes].reverse())for(const binding of scope.handlers){
      if(binding.key.toLowerCase()!==event.key.toLowerCase())continue;
      const modifiers=binding.modifiers.map(m=>m.toLowerCase());
      if(!!event.ctrlKey!==modifiers.includes("ctrl")||!!event.altKey!==modifiers.includes("alt")||!!event.shiftKey!==modifiers.includes("shift")||!!event.metaKey!==modifiers.includes("meta"))continue;
      if(binding.func(event)===false){event.preventDefault();event.stopImmediatePropagation();return;}
    }
  },true);
  workspace.app=app;workspace.containerEl=root;workspace.layoutReady=true;workspace.leaves=[];
  workspace.onLayoutReady=callback=>callback();workspace.iterateAllLeaves=callback=>workspace.leaves.forEach(callback);
  workspace.getLeavesOfType=type=>workspace.leaves.filter(l=>l.type===type);
  workspace.getMostRecentLeaf=()=>workspace.activeLeaf;
  workspace.revealLeaf=async leaf=>{workspace.activeLeaf=leaf;workspace.trigger("active-leaf-change",leaf);};
  workspace.setActiveLeaf=leaf=>workspace.revealLeaf(leaf);
  workspace.getLeaf=()=>{
    const leaf={app,containerEl:root,contentEl:root.createDiv({cls:"view-content"}),type:"empty",getRoot:()=>workspace,
      async setViewState({type,state}){
        if(leaf.view&&leaf.type===type){if(state)await leaf.view.setState(state);workspace.activeLeaf=leaf;return;}
        const create=app.views.get(type);if(!create)throw new Error('지원하지 않는 보기입니다.');
        if(leaf.view){await leaf.view.onClose?.();leaf.view.unload();}
        leaf.contentEl.replaceChildren();leaf.type=type;leaf.view=create(leaf);await leaf.view.load();
        if(state)await leaf.view.setState(state);workspace.activeLeaf=leaf;await leaf.view.onOpen();
      },
      async openFile(file){return workspace.openLinkText(file.path);},
      async detach(){await leaf.view?.onClose?.();leaf.view?.unload();leaf.contentEl.remove();workspace.leaves=workspace.leaves.filter(l=>l!==leaf);},
    };workspace.leaves.push(leaf);return leaf;
  };
  workspace.openLinkText=async value=>{const record=await readState("file:"+value);if(!record){new Notice("연결된 파일이 이 브라우저에 없습니다. 파일 보관함에서 추가해 주세요.");return;}const url=URL.createObjectURL(new Blob([record.bytes],{type:record.type}));window.open(url,"_blank","noopener");setTimeout(()=>URL.revokeObjectURL(url),60000);};
  app.metadataCache={getFileCache:()=>null,getFirstLinkpathDest:()=>null};
  vault.getName=()=>"Sien Calendar Web";vault.configDir="";
  vault.getFiles=()=>[...files.keys()].map(name=>new TFile(name));vault.getMarkdownFiles=()=>[];
  vault.getAbstractFileByPath=path=>files.has(path)?new TFile(path):null;
  vault.adapter={getResourcePath:path=>new URL(path.replace(/^.*?assets\//,"assets/"),import.meta.url).href,exists:async path=>files.has(path),list:async()=>({files:[],folders:[]}),read:async path=>{const f=await readState("file:"+path);if(!f)throw new Error("연결된 파일이 없습니다.");return new TextDecoder().decode(f.bytes);}};
  vault.read=file=>vault.adapter.read(file.path);
  app.fileManager={trashFile:async()=>{throw new Error("브라우저 파일 보관함에서 연결을 해제해 주세요.");}};
  app.registerFile=async file=>{const path="attachments/"+crypto.randomUUID()+"-"+file.name;await writeState("file:"+path,{name:file.name,type:file.type,bytes:await file.arrayBuffer()});files.set(path,true);await writeState("files",[...files.keys()]);new Notice("이 기기에 파일을 추가했습니다. 첨부파일의 기기 간 동기화는 아직 지원하지 않습니다.");return new TFile(path);};
  app.emptyFiles=files;
  app.ready=readState("files").then(saved=>{for(const name of saved||[])files.set(name,true);});
  return app;
}
