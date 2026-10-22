import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Pure geometry regression: no browser, screenshots, renderer, or network.
const project=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const checks=[];
const sources={};
const check=(name,ok,details)=>checks.push({name,pass:!!ok,...details});
async function moduleUrl(file,replacements={}) {
  const text=await fs.readFile(path.join(project,file),'utf8');
  sources[file]=crypto.createHash('sha256').update(text).digest('hex');
  let js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  js=js.replace(/^import ['"][^'"]+\.css['"];\r?\n/gm,'');
  for(const [from,to] of Object.entries(replacements))js=js.replaceAll(`'${from}'`,`'${to}'`).replaceAll(`"${from}"`,`"${to}"`);
  return 'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
}
const geometryUrl=await moduleUrl('src/rebuild/runtime/geometry.ts');
const chaptersUrl=await moduleUrl('src/rebuild/config/chapters.ts');
const heroUrl=await moduleUrl('src/rebuild/scenes/HeroScene.ts');
const transitionUrl=await moduleUrl('src/rebuild/runtime/TransitionLayer.ts',{'./geometry':geometryUrl,'../config/chapters':chaptersUrl});
const geometry=await import(geometryUrl);
const {createHeroScene}=await import(heroUrl);
const {TransitionLayer}=await import(transitionUrl);

class Element {
  constructor(){this.children=[];this.style={cssText:'',setProperty(k,v){this[k]=v},getPropertyValue(k){return this[k]||''}};this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.innerHTML='';this._lookup=new Map()}
  setAttribute(){} removeAttribute(){} append(...nodes){nodes.forEach(n=>{n.parent=this;this.children.push(n)})}
  replaceChildren(...nodes){this.children=[];this.append(...nodes)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
  querySelector(s){if(!this._lookup.has(s)){const n=new Element();if(s.includes('data-instance-id'))n.append(new Element());this._lookup.set(s,n)}return this._lookup.get(s)}
  querySelectorAll(){return []}
  cloneNode(){const n=new Element();n.style={...this.style};return n}
  get firstElementChild(){return this.children[0]}
}
globalThis.document={createElement(){return new Element()}};
globalThis.Image=class extends Element { decode(){return Promise.resolve()} };
const defaultFrame={progress:0,enter:0,exit:0,opacity:1,active:true,ambientTime:0,ambientDeltaSeconds:0,reducedMotion:false,quality:'full',pointer:{x:0,y:0},handoffHiddenIds:[]};
const hero=createHeroScene(new Element());
await hero.ready;
const vectorDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const quadDifference=(a,b)=>Math.max(...a.map((p,i)=>vectorDistance(p,b[i])));
const matrixValues=matrix=>matrix.slice(9,-1).split(',').map(Number);
const mapPoint=(m,x,y)=>{const denominator=m[3]*x+m[7]*y+m[15];return{x:(m[0]*x+m[4]*y+m[12])/denominator,y:(m[1]*x+m[5]*y+m[13])/denominator}};
const mapCorners=(matrix,w,h)=>{const m=matrixValues(matrix);return [[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>mapPoint(m,x,y))};

let seed=9383;
const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
let maxCornerError=0;
for(let n=0;n<200;n++) {
  const width=40+random()*1100,height=30+random()*620,x=-400+random()*2000,y=-300+random()*1400;
  const q=[{x:x+random()*40,y:y+random()*40},{x:x+width,y:y+random()*30},{x:x+width-random()*40,y:y+height},{x:x+random()*35,y:y+height-random()*40}];
  const result=mapCorners(geometry.quadMatrix(q,width,height),width,height);
  maxCornerError=Math.max(maxCornerError,quadDifference(result,q));
}
check('projective map preserves all four corners for 200 deterministic convex quads',maxCornerError<1e-7,{maxErrorPx:maxCornerError});

let maxFoldMidlineError=0,maxFoldCornerError=0;
const warped=[{x:145,y:123},{x:405,y:100},{x:435,y:404},{x:130,y:380}];
const topMid=q=>({x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2});
const bottomMid=q=>({x:(q[2].x+q[3].x)/2,y:(q[2].y+q[3].y)/2});
for(const amount of [1,.75,.1,.016,0]) {
  const folded=geometry.foldedQuad(warped,amount);
  maxFoldMidlineError=Math.max(maxFoldMidlineError,vectorDistance(topMid(warped),topMid(folded)),vectorDistance(bottomMid(warped),bottomMid(folded)));
  maxFoldCornerError=Math.max(maxFoldCornerError,quadDifference(mapCorners(geometry.quadMatrix(folded,174,236),174,236),folded));
}
check('edge fold keeps source centerline height and exact corner projection',maxFoldMidlineError<1e-7&&maxFoldCornerError<1e-7,{maxMidlineErrorPx:maxFoldMidlineError,maxCornerErrorPx:maxFoldCornerError});

const viewports=[{width:1920,height:960,dpr:2,layout:'desktop'},{width:1440,height:900,dpr:1,layout:'desktop'},{width:1024,height:768,dpr:1,layout:'tablet'},{width:390,height:844,dpr:3,layout:'mobile'},{width:390,height:700,dpr:2,layout:'mobile'}];
let minWidth=Infinity,minHeight=Infinity,maxSourceMatrixError=0,maxHiddenAnchorDifference=0;
for(const v of viewports) {
  hero.resize(v);
  for(const exit of [0,.25,.5,.75,1])for(const id of ['hero-tag-video','hero-tag-research']){
    const frame={...defaultFrame,exit,ambientTime:8.7,pointer:{x:1,y:1}};
    const a=hero.sampleHandoff(id,frame);
    minWidth=Math.min(minWidth,a.width);minHeight=Math.min(minHeight,a.height);
    maxSourceMatrixError=Math.max(maxSourceMatrixError,quadDifference(mapCorners(geometry.quadMatrix(a.quad,a.width,a.height),a.width,a.height),a.quad));
    hero.update({...frame,handoffHiddenIds:[id]});
    maxHiddenAnchorDifference=Math.max(maxHiddenAnchorDifference,quadDifference(hero.sampleHandoff(id,frame).quad,a.quad));
  }
}
check('actual HeroScene emits positive dimensions and exact CSS source corners',minWidth>0&&minHeight>0&&maxSourceMatrixError<1e-7,{minWidthPx:minWidth,minHeightPx:minHeight,maxErrorPx:maxSourceMatrixError});
check('hidden source remains sampleable at the identical quad',maxHiddenAnchorDifference===0,{maxErrorPx:maxHiddenAnchorDifference});
hero.resize({width:720,height:900,dpr:1,layout:'tablet'});
const tabletAnchor=hero.sampleHandoff('hero-tag-video',defaultFrame);
const tabletExpected={x:174*720/1774,y:(900-720/2)/2+150*720/1774};
const tabletError=vectorDistance(tabletAnchor.quad[0],tabletExpected);
check('HeroScene respects the shared tablet/mobile layout classification at 720 px',tabletError<1e-7,{maxErrorPx:tabletError});

const box=(x,y,w,h,skew=0)=>[{x,y},{x:x+w,y:y+skew},{x:x+w-15,y:y+h},{x:x+10,y:y+h-skew}];
const anchor=(id,quad,width=360,height=240)=>({instanceId:id,assetId:id,assetVersion:'test',quad,uv:{x:0,y:0,w:1,h:1},src:'/fixture.webp',width,height,borderRadius:6,appearanceId:'fixture',occlusionGroup:'fixture',element:new Element()});
const galleryFixtures={
  'gallery-frame':anchor('gallery-frame',box(470,355,360,240,8)),
  'gallery-fieldnotes':anchor('gallery-fieldnotes',box(935,602,365,243,-6)),
  'community-travel':anchor('community-travel',box(590,304,340,226,8)),
  'community-companion':anchor('community-companion',box(1170,437,340,226,-6)),
  'community-writer':anchor('community-writer',box(885,670,340,226,4)),
};
const communityFixtures=Object.fromEntries(['community-travel','community-companion','community-writer'].map((id,i)=>[id,anchor(id,box(890+i*185,240+i*185,420,280,i*3))]));
const stub=fixtures=>({ready:Promise.resolve('ready'),resize(){},update(){},dispose(){},sampleHandoff(id){return fixtures[id]}});
const layerRoot=new Element(), layer=new TransitionLayer(layerRoot,hero,stub(galleryFixtures),stub(communityFixtures));
hero.resize(viewports[0]);layer.resize(viewports[0]);
const frames={hero:{...defaultFrame,ambientTime:8.7,pointer:{x:1,y:1}},gallery:defaultFrame,community:defaultFrame};
const visibleBridge=()=>layerRoot.children.filter(n=>n.style.visibility==='visible');
const paintedQuad=node=>mapCorners(node.style.transform,parseFloat(node.style.width),parseFloat(node.style.height));
layer.update(1e-7,0,frames,true);
const startBridges=visibleBridge();
const entryErrors=['hero-tag-video','hero-tag-research'].map((id,i)=>quadDifference(paintedQuad(startBridges[i]),hero.sampleHandoff(id,frames.hero).quad));
check('A enters within 2 px of the actual ambient hero source',Math.max(...entryErrors)<=2,{maxErrorPx:Math.max(...entryErrors),perTagPx:entryErrors});

layer.update(1-1e-7,0,frames,true);
const endBridges=visibleBridge();
const endErrors=['gallery-frame','gallery-fieldnotes'].map((id,i)=>quadDifference(paintedQuad(endBridges[i]),galleryFixtures[id].quad));
check('A settles within 2 px of both warped destination quads',Math.max(...endErrors)<=2,{maxErrorPx:Math.max(...endErrors)});

// Content switches at t=.38, when the paper is edge-on. The same projected
// silhouette must persist despite the source/destination intrinsic height change.
let low=0,high=1;for(let n=0;n<70;n++){const mid=(low+high)/2;if(mid*mid*(3-2*mid)<.38)low=mid;else high=mid}
const swap=(low+high)/2;
layer.update(swap-1e-8,0,frames,true);const before=paintedQuad(visibleBridge()[0]);
layer.update(swap+1e-8,0,frames,true);const after=paintedQuad(visibleBridge()[0]);
const swapError=quadDifference(before,after);
check('A face swap preserves warped silhouette and folded height',swapError<.01,{maxErrorPx:swapError,swapProgress:swap});

layer.update(1,1e-7,frames,true);
const bStart=visibleBridge();
const bStartError=Math.max(...Object.keys(communityFixtures).map((id,i)=>quadDifference(paintedQuad(bStart[i]),galleryFixtures[id].quad)));
layer.update(1,1-1e-7,frames,true);
const bEnd=visibleBridge();
const bEndError=Math.max(...Object.keys(communityFixtures).map((id,i)=>quadDifference(paintedQuad(bEnd[i]),communityFixtures[id].quad)));
check('B preserves source and destination exact quads at adjacent boundaries',bStartError<=2&&bEndError<=2,{entryMaxErrorPx:bStartError,exitMaxErrorPx:bEndError});

layer.update(.5,0,frames,true);const firstSeek=visibleBridge().map(n=>n.style.transform);
layer.update(.98,.4,frames,true);layer.update(.5,0,frames,true);
check('fixed frame A seek is independent of traversal history',firstSeek.every((m,i)=>m===visibleBridge()[i].style.transform),{});

// Descendant visibility:visible can override a hidden parent; display:none is
// required after a clone has existed during a previous chapter transition.
layer.update(1,1,frames,true);
check('completed handoffs remove every bridge subtree from rendering',layerRoot.children.every(n=>n.style.display==='none'),{bridges:layerRoot.children.length});
layer.update(.5,0,frames,true);
check('reverse entry restores only the two active A bridges',layerRoot.children.filter(n=>n.style.display==='block').length===2,{});
layer.update(.5,0,frames,false);
check('disabled handoffs suppress explicitly visible cloned descendants',layerRoot.children.every(n=>n.style.display==='none'),{});

const findings=[];
if(entryErrors.some(e=>e>2))findings.push({severity:'fix',location:'TransitionLayer.ts A source sample',finding:'Source sampling overrides ambientTime and pointer even though the displayed HeroScene retains both. Exact source-to-bridge entry jumps more than 2 CSS px.',suggestion:'Preserve frames.hero ambientTime/pointer while overriding exit:0, or freeze both scene and bridge consistently in the director before ownership changes.'});
const invalidDimensions=[[0,236],[-1,236],[NaN,236],[Infinity,236],[174,0],[174,-1],[174,NaN],[174,Infinity]];
const rejectedDimensions=invalidDimensions.map(([width,height])=>{try{geometry.quadMatrix(warped,width,height);return false}catch(error){return error instanceof RangeError}});
check('projective map rejects non-positive or non-finite source dimensions',rejectedDimensions.every(Boolean),{cases:invalidDimensions.length,rejected:rejectedDimensions.filter(Boolean).length});
if(!rejectedDimensions.every(Boolean))findings.push({severity:'fix',location:'geometry.ts quadMatrix',finding:'Invalid dimensions are not all rejected as RangeError; they can generate invalid matrix CSS.',suggestion:'Guard finite positive width and height before dividing.'});
hero.dispose();layer.dispose();
const result={version:'m05-geometry-check-1',testedAt:new Date().toISOString(),scope:'Actual TypeScript geometry, HeroScene anchor evaluation, and TransitionLayer paint math executed in Node with minimal inert DOM-shaped objects. No browser, no WebGL visual/compositing claim.',sources,summary:{passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length},checks,findings};
const out=path.join(project,'docs/rebuild/artifacts/M05/geometry-check.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,checks,findings},null,2));
process.exitCode=result.summary.failed?1:0;
