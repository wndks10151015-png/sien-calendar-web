import test from 'node:test';
import assert from 'node:assert/strict';
import {equalizePeriodLanes} from '../docs/layout.js';
const lane=(height,...keys)=>({laneHeight:height,measured:keys.map(spanKey=>({spanKey,height}))});
test('one period has the same height across week boundaries',()=>{
  const lanes=[lane(40,'a'),lane(63.1875,'a'),lane(40,'unrelated')];equalizePeriodLanes(lanes);
  assert.deepEqual(lanes.map(l=>l.laneHeight),[64,64,40]);
});
test('overlapping periods connect all affected weekly lanes',()=>{
  const lanes=[lane(40,'a'),lane(45,'a','b'),lane(68.5,'b'),lane(30)];equalizePeriodLanes(lanes,1.25);
  assert.deepEqual(lanes.map(l=>l.laneHeight),[68.8,68.8,68.8,30]);
});
test('unconnected lanes stay independent and empty input is safe',()=>{
  const lanes=[lane(25,'a'),lane(65,'b')];equalizePeriodLanes(lanes);assert.deepEqual(lanes.map(l=>l.laneHeight),[25,65]);
  assert.doesNotThrow(()=>equalizePeriodLanes([]));
});
