import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
// Execute the actual pure runtime evaluator, not a second implementation.
const source=await fs.readFile(path.join(root,'src/rebuild/scenes/gallery-motion.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {galleryLoop,galleryPose}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const base={progress:.35,enter:1,exit:0,opacity:1,active:true,ambientTime:0,ambientDeltaSeconds:0,reducedMotion:false,quality:'full',pointer:{x:0,y:0},handoffHiddenIds:[]};
const views=[{width:1920,height:960,dpr:2,layout:'desktop'},{width:1440,height:900,dpr:1,layout:'desktop'},{width:900,height:900,dpr:1,layout:'tablet'},{width:390,height:844,dpr:2,layout:'mobile'}];
const cards=[...Array.from({length:18},(_,index)=>({band:0,index,count:18,asset:{tier:index===4?'restricted':'middle'}})),...Array.from({length:18},(_,index)=>({band:1,index,count:18,asset:{tier:'middle'}})),...Array.from({length:12},(_,index)=>({band:2,index,count:12,asset:{tier:'middle'}})),...Array.from({length:8},(_,index)=>({band:3,index,count:8,asset:{tier:'near'}})),...Array.from({length:3},(_,index)=>({band:4,index,count:3,asset:{tier:'community'}}))];
let deterministicSamples=0,wraps=0,periods=0,incomingContinuity=0;
const cycles=[];
for(const viewport of views){
 const cycle={viewport,durationsSeconds:[]};
 for(const card of cards){
  for(const progress of [0,.46,.59,.72,1])for(const enter of [0,.5,1])for(const exit of [0,.5,1])for(const ambientTime of [0,2,150]){
   const frame={...base,progress,enter,exit,ambientTime};const a=galleryPose(card,viewport,frame);
   for(const value of Object.values(a))assert(Number.isFinite(value));
   galleryPose(card,viewport,{...frame,ambientTime:994,progress:1-progress});
   assert.deepEqual(a,galleryPose(card,viewport,frame),'Geometry must not depend on evaluation history');deterministicSamples++;
  }
  const reduced0=galleryPose(card,viewport,{...base,reducedMotion:true,ambientTime:0});
  const reducedLater=galleryPose(card,viewport,{...base,reducedMotion:true,ambientTime:1100});assert.deepEqual(reduced0,reducedLater);
  if(card.band===4){assert.deepEqual(galleryPose(card,viewport,{...base,progress:.74,ambientTime:0}),galleryPose(card,viewport,{...base,progress:.74,ambientTime:199}),'B source position settles before .74');assert.deepEqual(galleryPose(card,viewport,{...base,progress:.74,exit:0}),galleryPose(card,viewport,{...base,progress:.74,exit:1}),'Reserved B sources must not retreat with gallery');continue;}
  const beforeExit=galleryPose(card,viewport,{...base,exit:0}),afterExit=galleryPose(card,viewport,{...base,exit:1});
  assert(Math.abs(afterExit.width/beforeExit.width-.84)<1e-10,'Ordinary gallery planes recede to .84 scale');
  const nearExitStart=galleryPose(card,viewport,{...base,exit:1e-7});assert(Math.hypot(beforeExit.x-nearExitStart.x,beforeExit.y-nearExitStart.y)<1e-7,'Exit retreat must begin continuously');
  if(card.band===3&&(card.index===0||card.index===4)){
   for(const enter of [.1,.5,.9,1])for(const progress of [.1,.329,.4,.5,.7])for(const boundary of [68.137931,0,100,1000,1e6]){
    const a=galleryPose(card,viewport,{...base,enter,progress,ambientTime:boundary-.001});
    const b=galleryPose(card,viewport,{...base,enter,progress,ambientTime:boundary+.001});
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.1,'Designated A identities must never inherit a wrap jump');incomingContinuity++;
   }
   const a=galleryPose(card,viewport,{...base,progress:.7,ambientTime:5}),b=galleryPose(card,viewport,{...base,progress:.7,ambientTime:5+Math.PI*2/.08});
   assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,'Designated closed orbit must complete continuously');
   for(const time of [0,68.137931,1e6]){
    const a=galleryPose(card,viewport,{...base,progress:.329-.00001,ambientTime:time});
    const b=galleryPose(card,viewport,{...base,progress:.329+.00001,ambientTime:time});
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.001,'Release starts at the exact A endpoint with a zero tangent');
   }
   continue;
  }
  const loop=galleryLoop(card,viewport);if(card.index===(card.band===3?1:0))cycle.durationsSeconds.push({band:card.band,seconds:loop.duration});
  assert(Math.abs(galleryPose(card,viewport,{...base,ambientTime:5}).x-galleryPose(card,viewport,{...base,ambientTime:5+loop.duration}).x)<.00001,'Each orbit must return to its horizontal phase');periods++;
  const offset=loop.index*loop.spacing+loop.period*.5-viewport.width*.25;
  const n=loop.speed>0?Math.floor(offset/loop.period)+1:Math.ceil(offset/loop.period)-1;
  const boundary=(n*loop.period-offset)/loop.speed;
  const before=galleryPose(card,viewport,{...base,ambientTime:boundary-.001}),after=galleryPose(card,viewport,{...base,ambientTime:boundary+.001});
  assert(Math.abs(before.x-after.x)>loop.period*.99,'Test must straddle an actual wrap');
  for(const p of [before,after])assert(p.x+p.width*.7<0||p.x-p.width*.7>viewport.width,'Recycling must happen beyond the entire card');wraps++;
  if(card.asset.tier==='restricted')assert(loop.size<=120);
 }
 cycles.push(cycle);
}
const report={passed:true,deterministicSamples,completeHorizontalPeriods:periods,offscreenWraps:wraps,incomingContinuity,designatedOrbitSeconds:Math.PI*2/.08,regression:'A Frame/Fieldnotes evaluated around old wrap boundary68.137931s pluslargeclocks atenter.1/.5/.9/1, releaseendpointtangent andcompleteclosedorbit.',viewports:views.length,cycles,limits:'Pure production geometry verification. Does not assert browser GPU performance, full-scene aesthetics, or pixel-perfect DOM bridge matching.'};
await fs.writeFile(path.join(root,'docs/rebuild/artifacts/M04/motion-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
