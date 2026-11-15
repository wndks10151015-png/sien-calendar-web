import test from "node:test";
import assert from "node:assert/strict";
import {sharedDocument,retainDeviceViewState,withSharedViewModes} from "../docs/view-state.js";
import {mergeDocuments,resolveConflict} from "../docs/merge.js";

const fixture=()=>({schemaVersion:11,config:{calendarZoom:.9,headerCollapsed:false,tableState:{columnOrder:["title"],columnWidths:{title:250},manualRowOrder:["a"]},savedViews:[{id:"all",name:"All",mode:"month",calendarZoom:.9,filters:[],tableColumnOrder:["title"],tableColumnWidths:{title:250},tableManualOrder:["a"]}]},"item:a":{id:"a",title:"Original",custom_tasks:[{id:"1",done:false}]},"item:old":{id:"a",title:"History",deletedAt:"2026-11-01"}});
test("shared projection preserves every event and input object",()=>{
  const original=fixture(),copy=structuredClone(original),shared=sharedDocument(original);
  assert.deepEqual(original,copy);assert.deepEqual(shared["item:a"],original["item:a"]);assert.deepEqual(shared["item:old"],original["item:old"]);
  assert.equal(shared.config.calendarZoom,undefined);assert.equal(shared.config.savedViews[0].mode,undefined);assert.equal(shared.config.savedViews[0].tableColumnWidths,undefined);
  assert.deepEqual(shared.config.savedViews[0].filters,[]);assert.deepEqual(shared.config.savedViews[0].tableManualOrder,["a"]);
});
test("legacy mode and zoom conflicts disappear without resetting the sync base",()=>{
  const b=fixture(),l=fixture(),r=fixture();l.config.savedViews[0].mode="table";r.config.savedViews[0].mode="project";l.config.calendarZoom=1.4;r.config.calendarZoom=.7;r["item:a"].title="Remote";
  const m=mergeDocuments(sharedDocument(b),sharedDocument(l),sharedDocument(r));assert.deepEqual(m.conflicts,[]);
  const restored=retainDeviceViewState(m.document,l,r);assert.equal(restored.config.savedViews[0].mode,"table");assert.equal(restored.config.calendarZoom,1.4);assert.equal(restored["item:a"].title,"Remote");
});
test("a local mode change never replaces a saved view's shared initial type",()=>{
  const remote=fixture(),local=fixture();local.config.savedViews[0].mode="table";
  const payload=withSharedViewModes(sharedDocument(local),remote,local);assert.equal(payload.config.savedViews[0].mode,"month");
  assert.equal(retainDeviceViewState(sharedDocument(payload),local,payload).config.savedViews[0].mode,"table");
  assert.equal(retainDeviceViewState(sharedDocument(payload),{},payload).config.savedViews[0].mode,"month");
});
test("new saved views preserve their intended initial type on another device",()=>{
  const local=fixture();local.config.savedViews.push({id:"new",name:"Project",mode:"project",filters:[]});
  const payload=withSharedViewModes(sharedDocument(local),fixture(),local);assert.equal(payload.config.savedViews[1].mode,"project");
  assert.equal(retainDeviceViewState(sharedDocument(payload),fixture(),payload).config.savedViews[1].mode,"project");
});
test("screen-specific table layout remains local while manual row ordering is shared",()=>{
  const local=fixture(),shared=sharedDocument(local);assert.equal(shared.config.tableState.columnOrder,undefined);assert.deepEqual(shared.config.tableState.manualRowOrder,["a"]);
  const next=retainDeviceViewState(shared,local);assert.deepEqual(next.config.tableState.columnWidths,{title:250});assert.deepEqual(next.config.savedViews[0].tableColumnOrder,["title"]);
});
test("local state changed during a pull is retained and deleted views stay deleted",()=>{
  const local=fixture();local.config.savedViews[0].mode="project";local.config.savedViews.push({id:"deleted",mode:"month"});
  const next=retainDeviceViewState(sharedDocument(fixture()),local);assert.equal(next.config.savedViews[0].mode,"project");assert.equal(next.config.savedViews.length,1);
});
test("real event field conflicts still require an explicit choice",()=>{
  const b=fixture(),l=fixture(),r=fixture();l["item:a"].title="Local";r["item:a"].title="Remote";
  assert.deepEqual(mergeDocuments(sharedDocument(b),sharedDocument(l),sharedDocument(r)).conflicts.map(c=>c.path),[["item:a","title"]]);
});
test("saved-view field conflicts resolve by stable ID after reordering",()=>{
  const b=fixture(),l=fixture(),r=fixture();l.config.savedViews[0].name="Local";r.config.savedViews[0].name="Remote";r.config.savedViews.unshift({id:"first",name:"First"});
  const m=mergeDocuments(b,l,r),conflict=m.conflicts[0];assert.deepEqual(conflict.path,["config","savedViews","@all","name"]);
  resolveConflict(m.document,conflict.path,conflict.remote);assert.equal(m.document.config.savedViews.find(v=>v.id==="all").name,"Remote");
});
test("delete-versus-edit conflicts can restore the edited saved view",()=>{
  const b=fixture(),l=fixture(),r=fixture();l.config.savedViews=[];r.config.savedViews[0].name="Edited";
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,1);resolveConflict(m.document,m.conflicts[0].path,m.conflicts[0].remote);assert.equal(m.document.config.savedViews[0].name,"Edited");
});
test("incompatible view reorders remain explicit conflicts",()=>{
  const b=fixture();b.config.savedViews=[{id:"a"},{id:"b"},{id:"c"}];const l=structuredClone(b),r=structuredClone(b);l.config.savedViews.reverse();r.config.savedViews=[{id:"b"},{id:"a"},{id:"c"}];
  assert.deepEqual(mergeDocuments(b,l,r).conflicts.map(c=>c.path),[["config","savedViews"]]);
});
test("malformed view entries are not silently discarded by projection",()=>{
  const d=fixture();d.config.savedViews.push(null);assert.equal(sharedDocument(d).config.savedViews.at(-1),null);
});
test("local-only view changes do not upload bookkeeping changes",()=>{
  const b=fixture();b.config.revision=3;b.config.updatedAt="2026-11-01";b.updatedAt="2026-11-01";
  const l=structuredClone(b);l.config.savedViews[0].mode="table";l.config.revision=9;l.config.updatedAt="2026-11-15";l.updatedAt="2026-11-15";
  assert.deepEqual(sharedDocument(l,b),sharedDocument(b));
  l["item:a"].title="Edited";assert.equal(sharedDocument(l,b).config.revision,9);
});
