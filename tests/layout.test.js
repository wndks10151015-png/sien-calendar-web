import test from 'node:test';
import assert from 'node:assert/strict';
import {equalizePeriodLanes} from '../docs/layout.js';
const lane=(height,...keys)=>({laneHeight:height,measured:keys.map(spanKey=>({spanKey,height}))});
test('one period has the same height across week boundaries',()=>{
  const lanes=[lane(40,'a'),lane(63.1875,'a'),lane(40,'unrelated')];equalizePeriodLanes(lanes);
  assert.deepEqual(lanes.map(l=>l.laneHeight),[64,64,40]);
});
test('overlapping periods share spacing but retain their own card heights',()=>{
  const lanes=[lane(40,'a'),lane(45,'a','b'),lane(68.5,'b'),lane(30)];equalizePeriodLanes(lanes,1.25);
  assert.deepEqual(lanes.map(l=>l.laneHeight),[45.6,68.8,68.8,30]);
  assert.equal(lanes[0].measured[0].spanHeight,45.6);
  assert.equal(lanes[1].measured[0].spanHeight,45.6);
  assert.equal(lanes[1].measured[1].spanHeight,68.8);
});
test('unconnected lanes stay independent and empty input is safe',()=>{
  const lanes=[lane(25,'a'),lane(65,'b')];equalizePeriodLanes(lanes);assert.deepEqual(lanes.map(l=>l.laneHeight),[25,65]);
  assert.doesNotThrow(()=>equalizePeriodLanes([]));
});
test('a short period does not inherit the height of a tall ordinary card',()=>{
  const lanes=[{laneHeight:150,measured:[{spanKey:'a',height:40},{spanKey:'',height:150}]},lane(40,'a')];
  equalizePeriodLanes(lanes);
  assert.equal(lanes[0].measured[0].spanHeight??lanes[0].laneHeight,40);
  assert.equal(lanes[1].measured[0].spanHeight??lanes[1].laneHeight,40);
});
test('different periods in one lane keep independent card heights',()=>{
  const lanes=[{laneHeight:120,measured:[{spanKey:'a',height:40},{spanKey:'b',height:120}]},lane(40,'a')];
  equalizePeriodLanes(lanes);
  assert.equal(lanes[0].measured[0].spanHeight??lanes[0].laneHeight,40);
  assert.equal(lanes[0].measured[1].spanHeight??lanes[0].laneHeight,120);
});
