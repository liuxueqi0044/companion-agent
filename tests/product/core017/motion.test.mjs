import test from 'node:test'
import assert from 'node:assert/strict'
import {createCompanion,moveCompanion,advanceCompanion,clampPosition} from '../../../apps/desktop/personal-space/companion-motion.mjs'

test('autonomous route actually walks, rests, changes direction and remains bounded',()=>{
  let s=createCompanion();const poses=new Set(),directions=new Set(),positions=[]
  for(let i=0;i<5400;i++){
    s=advanceCompanion(s,1/60);poses.add(s.pose);directions.add(s.facing);positions.push(s.x)
    assert.ok(s.x>=12&&s.x<=84)
  }
  assert.ok(poses.has('walk')&&poses.has('idle'));assert.equal(directions.size,2)
  assert.ok(Math.max(...positions)-Math.min(...positions)>35)
})
test('pointer destinations are clamped; a long frame cannot teleport the character',()=>{
  let s=moveCompanion(createCompanion(),900);assert.equal(s.target,84)
  s=advanceCompanion(s,99);assert.ok(s.x-56<=.551)
  assert.equal(moveCompanion(s,-300).target,12);assert.equal(clampPosition(NaN),52)
})
test('busy state stops movement and distinguishes thinking from actual processing',()=>{
  const start=advanceCompanion(moveCompanion(createCompanion(),80),.1)
  const thinking=advanceCompanion(start,.1,{busy:true})
  assert.equal(thinking.x,start.x);assert.equal(thinking.target,start.x);assert.equal(thinking.pose,'think')
  assert.equal(advanceCompanion(start,.1,{busy:true,working:true,sleep:true}).pose,'working')
})
test('hidden surfaces freeze; reduced motion permits immediate explicit placement but no roaming',()=>{
  const s=moveCompanion(createCompanion(),30)
  assert.equal(advanceCompanion(s,.1,{hidden:true}),s)
  const reduced=advanceCompanion(s,.1,{reduced:true});assert.equal(reduced.x,30);assert.equal(reduced.pose,'idle')
  assert.equal(advanceCompanion(reduced,.1,{reduced:true}).x,30)
})
test('pause suppresses autonomous travel but preserves explicit keyboard/pointer movement',()=>{
  let s=advanceCompanion(moveCompanion(createCompanion(),80),.1,{roam:false})
  assert.equal(s.pose,'walk')
  for(let i=0;i<1000;i++)s=advanceCompanion(s,.1,{roam:false})
  assert.equal(s.x,80);assert.equal(s.pose,'idle')
  const next=advanceCompanion({...s,target:20,manual:false},.1,{roam:false});assert.equal(next.x,80)
})
test('drag, greeting and decorative sleep have stable priority without work effects',()=>{
  const s=createCompanion()
  assert.equal(advanceCompanion(s,.1,{dragging:true,greeting:true}).pose,'idle')
  assert.equal(advanceCompanion(s,.1,{greeting:true,sleep:true}).pose,'celebrate')
  const nap=advanceCompanion(s,.1,{sleep:true});assert.equal(nap.pose,'sleep');assert.equal(nap.x,s.x)
})
