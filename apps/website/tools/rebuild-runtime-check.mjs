import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const project=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const reports=[],sources={};
const check=(name,pass,details={})=>reports.push({name,pass:!!pass,...details});
async function load(file,replacements={}){
 const text=await fs.readFile(path.join(project,file),'utf8');sources[file]=crypto.createHash('sha256').update(text).digest('hex');
 let code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 for(const [key,value] of Object.entries(replacements))code=code.replaceAll(`'${key}'`,`'${value}'`).replaceAll(`"${key}"`,`"${value}"`);
 return url(code);
}
class Node extends EventTarget{
 constructor(){super();this.dataset={};this.style={};this.offsetHeight=5850;this.inert=false;this.attrs={};this.classList={toggle(){},add(){},remove(){}}}
 setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}
 querySelector(){return null}querySelectorAll(){return []}
}
globalThis.Element=Node;globalThis.HTMLElement=Node;
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Node());return elements.get(id)};
const document=new Node();document.body=new Node();document.hidden=false;
document.getElementById=get;document.querySelector=q=>q==='.review-controls'?null:get(q);document.querySelectorAll=()=>[];
globalThis.document=document;
const window=new Node();window.matchMedia=()=>Object.assign(new Node(),{matches:false});globalThis.window=window;
globalThis.location={search:'',pathname:'/rebuild',hash:''};globalThis.innerWidth=1440;globalThis.innerHeight=900;globalThis.devicePixelRatio=1;
globalThis.history={replaceState(...args){globalThis.__historyArgs=args}};
const gsapUrl=url(`export default {registerPlugin(){},ticker:{add(fn){globalThis.__runtimeTick=fn},remove(){}}}`);
const scrollUrl=url(`export const ScrollTrigger={update(){},refresh(){},create(){return {progress:0,kill(){}}}}`);
const lenisUrl=url(`export default class Lenis{on(){}destroy(){}resize(){}raf(){}stop(){this.stopped=true}start(){this.stopped=false}scrollTo(target,options){this.lastScroll={target,options}}}`);
const transitionUrl=url(`export class TransitionLayer{resize(){}dispose(){}hidden(a,b,enabled){return{hero:enabled&&a>0&&a<1?['hero-tag-video','hero-tag-research']:[],gallery:[],community:[]}}update(a,b,frames,enabled){globalThis.__runtimeBridge={a,b,enabled}}}`);
const chaptersUrl=await load('src/rebuild/config/chapters.ts');
const qualityUrl=await load('src/rebuild/runtime/QualityPolicy.ts');
const directorUrl=await load('src/rebuild/runtime/StoryDirector.ts',{'gsap':gsapUrl,'gsap/ScrollTrigger':scrollUrl,'lenis':lenisUrl,'../config/chapters':chaptersUrl,'./QualityPolicy':qualityUrl,'./TransitionLayer':transitionUrl});
const {StoryDirector}=await import(directorUrl);
const resolves=[];
const modules=Object.fromEntries(['hero','gallery','community'].map(id=>[id,{ready:new Promise(resolve=>resolves.push(resolve)),resize(){},update(frame){this.frame=frame},dispose(){}}]));
const host={ready:true,resize(){},render(){},dispose(){}};
const director=new StoryDirector(modules,host);
director.progress=.25;director.render();resolves.forEach(r=>r('ready'));
await Promise.resolve();await Promise.resolve();await Promise.resolve();
check('late asset readiness does not switch ownership inside A',director.handoffCandidate===true&&director.handoffsReady===false,{candidate:director.handoffCandidate,active:director.handoffsReady});
director.progress=.48;director.render();
check('ready handoffs activate at a stable gallery chapter',director.handoffsReady===true,{active:director.handoffsReady});
director.progress=.77;director.render();host.ready=false;get('gallery-scene').dispatchEvent(new Event('gallery-context-lost'));
check('context loss revokes bridge and local hidden ownership',!director.handoffsReady&&!director.handoffCandidate&&globalThis.__runtimeBridge.enabled===false,{active:director.handoffsReady,candidate:director.handoffCandidate,bridgeEnabled:globalThis.__runtimeBridge.enabled});

director.ambientTime=10;director.pointer={x:.2,y:.3};
window.dispatchEvent(new CustomEvent('dialog:change',{detail:{open:true}}));
document.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',clientX:1400,clientY:50}));
globalThis.__runtimeTick(1,16);
check('modal lock stops Lenis, ambient clock and pointer drift',director.lenis.stopped===true&&director.ambientTime===10&&director.pointer.x===.2&&director.pointer.y===.3,{ambientTime:director.ambientTime,pointer:director.pointer});
director.fixed=.25;director.fixedTime=0;director.reviewMode='A';director.playDirection=1;
globalThis.__runtimeTick(1.1,16);
check('modal lock pauses review playback progress',director.fixed===.25,{expected:.25,actual:director.fixed});
window.dispatchEvent(new CustomEvent('dialog:change',{detail:{open:false}}));document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
const beforeHidden=director.fixed;globalThis.__runtimeTick(1.2,16);
check('hidden document pauses review playback progress',director.fixed===beforeHidden,{expected:beforeHidden,actual:director.fixed});
document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));const beforeResume=director.fixed;globalThis.__runtimeTick(1.3,16);
check('review playback resumes after modal and visibility restore',director.fixed>beforeResume&&director.lenis.stopped===false,{before:beforeResume,after:director.fixed});

director.fixedTime=0;director.pointer={x:1,y:-1};const first=director.frames(.5);director.frames(.91);director.pointer={x:-1,y:1};const second=director.frames(.5);
check('fixed-time frame evaluation is reversible and pointer independent',JSON.stringify(first)===JSON.stringify(second),{});
director.fixed=.5;director.playDirection=1;director.go('community');
check('fast chapter jump clears fixed playback and targets exact chapter anchor',director.fixed===null&&director.playDirection===0&&Math.abs(director.lenis.lastScroll.target-.94*(5850-900))<1e-9,{target:director.lenis.lastScroll.target});

const {QualityPolicy}=await import(qualityUrl);const policy=new QualityPolicy();
globalThis.innerWidth=680;const at680=policy.viewport().layout;globalThis.innerWidth=681;const at681=policy.viewport().layout;
check('shared mobile breakpoint agrees with CSS at 680 px',at680==='mobile'&&at681==='tablet',{at680,at681});
director.dispose();
const report={version:'m06-runtime-check-1',testedAt:new Date().toISOString(),scope:'Actual StoryDirector and QualityPolicy code in Node with inert DOM/event/scroll adapters; no real browser scroll, native dialog, GPU or visual assertion.',sources,summary:{passed:reports.filter(r=>r.pass).length,failed:reports.filter(r=>!r.pass).length},checks:reports};
const output=path.join(project,'docs/rebuild/artifacts/M06/runtime-check.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.summary.failed?1:0;
