import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDocuments,canonical,resolveConflict,isPristineDocument,validateDocument} from '../docs/merge.js';
import {sharedDocument,retainDeviceViewState} from '../docs/view-state.js';

const values=['한글 😀','日本語','مرحبا','',null,false,0,-1,['one','둘'],{address:'검사 주소',latitude:0}];
let seed=0x51ea30;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
const pick=()=>structuredClone(values[Math.floor(random()*values.length)]);
test('500 generated independent event changes retain both sides and every original record',()=>{
 for(let n=0;n<500;n++){
  const b={schemaVersion:11,config:{customProperties:[]}};
  for(let i=0;i<n%7;i++)b['item:storage-'+i]={id:i%3===0?'legacy-shared-id':'id-'+i,title:'Record '+i,notes:pick(),deletedAt:i%4===0?'2026-01-01':''};
  const l=structuredClone(b),r=structuredClone(b);l['item:new-a']={id:'a',title:pick()};r['item:new-b']={id:'b',notes:pick()};
  const input=canonical([b,l,r]),m=mergeDocuments(b,l,r);assert.deepEqual(m.conflicts,[]);assert.equal(canonical(m.document['item:new-a']),canonical(l['item:new-a']));assert.equal(canonical(m.document['item:new-b']),canonical(r['item:new-b']));
  for(const key of Object.keys(b).filter(k=>k.startsWith('item:')))assert.deepEqual(m.document[key],b[key]);assert.equal(canonical([b,l,r]),input);validateDocument(m.document);
 }
});
test('500 generated additions to project options preserve all labels and unrelated property edits',()=>{
 for(let n=0;n<500;n++){
  const options=Array.from({length:n%9},(_,i)=>'old-'+i),b={schemaVersion:11,config:{customProperties:[{key:'project',options,optionLabels:{}},{key:'memo',name:'메모'}]}};
  const l=structuredClone(b),r=structuredClone(b);l.config.customProperties[0].options.push('local-'+n);l.config.customProperties[0].optionLabels['local-'+n]='L '+n;r.config.customProperties[0].options.push('remote-'+n);r.config.customProperties[0].optionLabels['remote-'+n]='R '+n;r.config.customProperties[1].name='Memo '+n;
  const m=mergeDocuments(b,l,r),p=m.document.config.customProperties.find(p=>p.key==='project');assert.deepEqual(m.conflicts,[]);assert.deepEqual(new Set(p.options),new Set([...options,'local-'+n,'remote-'+n]));assert.equal(p.optionLabels['local-'+n],'L '+n);assert.equal(p.optionLabels['remote-'+n],'R '+n);assert.equal(m.document.config.customProperties.find(p=>p.key==='memo').name,'Memo '+n);
 }
});
test('500 generated presentation projections are idempotent and never change event data',()=>{
 for(let n=0;n<500;n++){
  const d={schemaVersion:11,config:{calendarZoom:random()*2,savedViews:[{id:'all',name:'All',mode:['month','project','table'][n%3],filters:[]}]},'item:one':{id:'one',notes:pick(),sienProjectConnectionSides:{p:{a:{from:'top',to:'left'}}}}};
  const input=canonical(d),shared=sharedDocument(d);assert.deepEqual(sharedDocument(shared),shared);assert.deepEqual(shared['item:one'],d['item:one']);assert.deepEqual(retainDeviceViewState(shared,d)['item:one'],d['item:one']);assert.equal(canonical(d),input);
 }
});
test('100 generated custom-property delete/edit conflicts restore the explicitly selected record',()=>{
 for(let n=0;n<100;n++){
  const b={schemaVersion:11,config:{customProperties:[{key:'property-'+n,name:'Original'}]}},l=structuredClone(b),r=structuredClone(b);l.config.customProperties=[];r.config.customProperties[0].name='Selected '+n;
  const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,1);resolveConflict(m.document,m.conflicts[0].path,m.conflicts[0].remote);assert.deepEqual(m.document.config.customProperties,r.config.customProperties);
 }
});
test('empty-project and iCal-only documents are never classified as disposable empty devices',()=>{
 assert.equal(isPristineDocument({schemaVersion:11,config:{},externalCalendarCache:{},migration:{version:1},updatedAt:'now'}),true);
 for(const d of [
  {schemaVersion:11,config:{customProperties:[{key:'p',options:['empty-project']}] }},
  {schemaVersion:11,config:{externalCalendars:[{id:'ical',name:'Local'}]}},
  {schemaVersion:11,externalCalendarCache:{ical:{events:[{title:'One'}]}}},
  {schemaVersion:11,'item:deleted':{id:'one',deletedAt:'yesterday'}},
  {schemaVersion:11,config:{unknownUserSetting:false}},
 ])assert.equal(isPristineDocument(d),false);
});
