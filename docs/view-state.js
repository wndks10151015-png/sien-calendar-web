import {canonical} from "./merge.js";
// Runtime presentation stays in this browser's document, not in the shared calendar.
const configFields=["defaultView","daysVisible","hourHeight","calendarZoom","calendarZoomMode","mobileMonthZoom","allDayCollapsed","allDayHeight","headerCollapsed"];
const viewFields=["mode","daysVisible","hourHeight","calendarZoom","mobileMonthZoom","allDayCollapsed","allDayHeight","agendaShowEmptyDates","tableColumnOrder","tableHiddenProperties","tableColumnWidths"];
const tableFields=["columnOrder","hiddenProperties","columnWidths"];
const views=config=>Array.isArray(config?.savedViews)?config.savedViews.filter(v=>v&&typeof v==="object"&&!Array.isArray(v)):[];
const copyFields=(target,source,fields)=>{for(const key of fields)if(Object.hasOwn(source||{},key))target[key]=structuredClone(source[key]);};
const metadata=["revision","_revision","configRevision","updatedAt","_updatedAt","modified","configUpdatedAt","_commitId","commitId"];
const content=document=>{
  const result={...document};if(result.config)result.config={...result.config};
  for(const target of [result,result.config])if(target)for(const key of metadata)delete target[key];
  return canonical(result);
};

export function sharedDocument(document,base){
  const result=structuredClone(document),config=result.config;
  if(!config||typeof config!=="object")return result;
  for(const key of configFields)delete config[key];
  for(const view of views(config))for(const key of viewFields)delete view[key];
  if(config.tableState)for(const key of tableFields)delete config.tableState[key];
  if(base){
    const reference=sharedDocument(base);
    // The engine bumps counters even for local-only layout changes.
    if(content(result)===content(reference))for(const [target,source]of [[result,reference],[config,reference.config]]){
      for(const key of metadata){if(Object.hasOwn(source||{},key))target[key]=source[key];else delete target[key];}
    }
  }
  return result;
}

export function retainDeviceViewState(shared,device,defaults={}){
  const result=structuredClone(shared),config=result.config;
  if(!config||typeof config!=="object")return result;
  copyFields(config,device.config,configFields);
  for(const view of views(config)){
    const own=views(device.config).find(v=>v.id===view.id),fallback=views(defaults.config).find(v=>v.id===view.id);
    if(fallback&&Object.hasOwn(fallback,"mode"))view.mode=fallback.mode;
    copyFields(view,own,viewFields);
  }
  if(config.tableState)copyFields(config.tableState,device.config?.tableState,tableFields);
  return result;
}

export function withSharedViewModes(shared,...sources){
  const result=structuredClone(shared);
  for(const view of views(result.config)){
    // Preserve a saved view's initial type for new devices; switching tabs is local.
    const initial=sources.flatMap(source=>views(source?.config)).find(v=>v.id===view.id&&typeof v.mode==="string");
    if(initial)view.mode=initial.mode;
  }
  return result;
}
