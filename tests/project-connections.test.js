import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD_SIDES,CONNECTION_SIDES,cardAnchor,nearestCardSide,connectionCurve,connectionPath,connectionSides,writeConnectionSides,validConnectionSides} from '../docs/project-connections.js';

test('four card edges use the actual measured card dimensions',()=>{
  const node={x:-20,y:30,width:300,height:80};
  assert.deepEqual(CARD_SIDES.map(side=>cardAnchor(node,side)),[{x:130,y:30},{x:280,y:70},{x:130,y:110},{x:-20,y:70}]);
  for(const side of CARD_SIDES)assert.equal(nearestCardSide(node,cardAnchor(node,side)),side);
});
test('all sixteen side pairs create finite outward cubic controls',()=>{
  for(const from of CARD_SIDES)for(const to of CARD_SIDES){
    const path=connectionCurve({x:5,y:-10},{x:205,y:100},from,to);
    assert.match(path,/^M5,-10 C[-\d., ]+ 205,100$/);assert.ok(!path.includes('NaN'));
  }
  assert.equal(connectionCurve({x:0,y:0},{x:100,y:0},'top','bottom'),'M0,0 C0,-50 100,50 100,0');
});
test('legacy edges retain right-to-left anchors without mutating event data',()=>{
  const a={id:'source',x:0,y:0,width:200,height:100,item:{}},b={id:'target',x:400,y:0,width:200,height:100,item:{title:'record'}};
  assert.deepEqual(connectionSides(a,b,'project'),{from:'right',to:'left'});
  assert.equal(connectionPath(a,b,'project'),'M200,50 C300,50 300,50 400,50');
  assert.deepEqual(b.item,{title:'record'});
});
test('side changes preserve other projects, incoming branches, and ordinary fields',()=>{
  const prior={one:{source:{from:'right',to:'left'},other:{from:'top',to:'left'}},two:{source:{from:'bottom',to:'top'}}};
  const item={title:'keep',custom_place:{label:'keep'},[CONNECTION_SIDES]:prior};
  writeConnectionSides(item,'one','source',{from:'bottom',to:'top'});
  assert.deepEqual(item[CONNECTION_SIDES].one.source,{from:'bottom',to:'top'});
  assert.equal(prior.one.source.from,'right');assert.equal(item[CONNECTION_SIDES].one.other,prior.one.other);
  assert.equal(item[CONNECTION_SIDES].two,prior.two);assert.equal(item.title,'keep');assert.deepEqual(item.custom_place,{label:'keep'});
  writeConnectionSides(item,'one','source',null);
  assert.deepEqual(item[CONNECTION_SIDES].one,{other:{from:'top',to:'left'}});
});
test('deleting the last anchor does not leave phantom connection metadata',()=>{
  const item={id:'event'};writeConnectionSides(item,'p','from',{from:'left',to:'right'});writeConnectionSides(item,'p','from',null);
  assert.deepEqual(item,{id:'event'});
});
test('invalid external anchor metadata falls back to legacy geometry',()=>{
  for(const value of [null,{},'left',{from:'left',to:'anything'},{from:'top'}]){
    assert.equal(validConnectionSides(value),false);
    assert.deepEqual(connectionSides({id:'a'},{item:{[CONNECTION_SIDES]:{p:{a:value}}}},'p'),{from:'right',to:'left'});
  }
});
