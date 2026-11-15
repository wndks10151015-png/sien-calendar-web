import test from "node:test";
import assert from "node:assert/strict";
import {mergeDocuments,validateDocument} from "../docs/merge.js";

const base=()=>({schemaVersion:11,config:{projectPropertyKey:"project",customProperties:[]}, "item:a":{id:"a",title:"검사 일정",revision:1,notes:"",deletedAt:""}});
test("independent records from two devices are retained",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);l["item:b"]={id:"b",title:"추가 일정"};r["item:a"].notes="원격 메모";
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.document["item:b"].title,"추가 일정");assert.equal(m.document["item:a"].notes,"원격 메모");
});
test("concurrent edits to different fields of an event merge",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);l["item:a"].title="내 제목";r["item:a"].notes="원격 메모";
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.document["item:a"].title,"내 제목");assert.equal(m.document["item:a"].notes,"원격 메모");
});
test("same-field conflicts require a user decision",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);l["item:a"].title="내 제목";r["item:a"].title="원격 제목";
  const m=mergeDocuments(b,l,r);assert.deepEqual(m.conflicts.map(c=>c.path),[["item:a","title"]]);
});
test("deleted-record tombstones survive a stale device",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);l["item:a"].deletedAt="2026-11-15T00:00:00Z";
  assert.equal(mergeDocuments(b,l,r).document["item:a"].deletedAt,l["item:a"].deletedAt);
});
test("project edges, custom states, places and subtasks are losslessly retained",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);
  Object.assign(l["item:a"],{sienProjectPredecessors:["internal:b"],custom_place:{address:"검사 주소"},custom_tasks:[{id:"one",title:"첫 단계",done:false}],custom_state:"사용자 상태"});
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.deepEqual(m.document,l);
});
test("timestamps do not create artificial field conflicts",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);b.updatedAt="2026-11-01";l.updatedAt="2026-11-03";r.updatedAt="2026-11-02";
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.document.updatedAt,"2026-11-03");
});
test("a future schema is rejected instead of overwritten",()=>assert.throws(()=>validateDocument({schemaVersion:12})));
test("legacy records with a shared logical ID retain their independent storage identities",()=>{
  const d={schemaVersion:11,"item:live":{id:"one",deletedAt:""},"item:history":{id:"one",deletedAt:"2026-11-01"}};
  assert.equal(validateDocument(d),d);assert.equal(Object.keys(mergeDocuments(d,d,d).document).length,3);
});
test("malformed record identities are rejected",()=>assert.throws(()=>validateDocument({schemaVersion:11,"item:a":{id:{unexpected:true}}})));
test("input documents are not mutated",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);l["item:a"].notes="추가";const inputs=JSON.stringify([b,l,r]);mergeDocuments(b,l,r);assert.equal(JSON.stringify([b,l,r]),inputs);
});
test("synchronization commit metadata does not block independent edits",()=>{
  const b=base(),l=structuredClone(b),r=structuredClone(b);
  l.config._commitId="new-a";r.config._commitId="new-b";
  l["item:a"].title="내 제목";r["item:a"].notes="원격 메모";
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.document.config._commitId,"new-b");
});
test("nested prototype-pollution payloads are rejected",()=>assert.throws(()=>validateDocument(JSON.parse('{"schemaVersion":11,"config":{"__proto__":{"polluted":true}}}'))));

test("independent fields of the same saved view merge by stable identity",()=>{
  const b=base();b.config.savedViews=[{id:"all",name:"All",sort:"title",filters:[]}];
  const l=structuredClone(b),r=structuredClone(b);l.config.savedViews[0].name="Renamed";r.config.savedViews[0].sort="date";
  const m=mergeDocuments(b,l,r);assert.deepEqual(m.conflicts,[]);assert.equal(m.document.config.savedViews[0].name,"Renamed");assert.equal(m.document.config.savedViews[0].sort,"date");
});
test("independent saved-view additions and deletions preserve other views",()=>{
  const b=base();b.config.savedViews=[{id:"all",name:"All"},{id:"old",name:"Old"}];
  const l=structuredClone(b),r=structuredClone(b);l.config.savedViews.pop();r.config.savedViews.push({id:"new",name:"New"});
  const m=mergeDocuments(b,l,r);assert.deepEqual(m.conflicts,[]);assert.deepEqual(m.document.config.savedViews.map(v=>v.id),["all","new"]);
});
