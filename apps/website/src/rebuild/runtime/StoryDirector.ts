import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type {SceneFrame,SceneId,SceneModule} from '../types';
import {chapters,transitions,phase,smooth,clamp} from '../config/chapters';
import {QualityPolicy} from './QualityPolicy';
import {TransitionLayer} from './TransitionLayer';
import type {GalleryHost} from './GalleryHost';

gsap.registerPlugin(ScrollTrigger);
type Modules=Record<SceneId,SceneModule>;
export class StoryDirector {
  private params=new URLSearchParams(location.search);
  private quality=new QualityPolicy();
  private lenis:Lenis|null=null;
  private trigger:ScrollTrigger|null=null;
  private abort=new AbortController();
  private progress=0;private ambientTime=0;private paused=false;private blocked=false;private hidden=false;
  private fixed:number|null=null;private fixedTime:number|null=null;private reviewMode='story';private playDirection=0;
  private bridge:TransitionLayer;private handoffsReady=false;private handoffCandidate=false;private removeMedia:()=>void;
  private roots:Record<SceneId,HTMLElement>;private copies:Record<SceneId,HTMLElement>;
  private pointer={x:0,y:0};
  private history:number[]=[];private frameCount=0;private fpsLabel=document.querySelector<HTMLElement>('.review-controls');
  private paintReadyAt=Infinity;
  private track=document.getElementById('story-track')!;
  constructor(private modules:Modules,private host:GalleryHost){
    this.roots={hero:document.getElementById('hero-scene')!,gallery:document.getElementById('gallery-scene')!,community:document.getElementById('community-scene')!};
    this.copies={hero:document.getElementById('hero')!,gallery:document.getElementById('gallery')!,community:document.getElementById('community')!};
    this.bridge=new TransitionLayer(document.getElementById('transition-layer')!,modules.hero,modules.gallery,modules.community);
    if(this.params.has('frame'))this.fixed=clamp(Number(this.params.get('frame'))||0);
    if(this.params.has('time'))this.fixedTime=Math.max(0,Number(this.params.get('time'))||0);
    this.removeMedia=this.quality.listen(()=>this.configure());
    this.bindEvents();this.configure();this.configureReview();
    gsap.ticker.add(this.tick);
    Promise.all(Object.values(modules).map(m=>m.ready)).then(r=>{this.handoffCandidate=r.every(v=>v==='ready')&&this.host.ready;
      // Fixed-frame review begins after decode; ordinary scrolling only promotes at a stable chapter.
      if(this.params.has('frame')||this.params.has('review')||this.params.has('replay'))this.handoffsReady=this.handoffCandidate;
      document.body.dataset.assetsReady=this.handoffCandidate?'ready':'fallback';this.paintReadyAt=this.frameCount+3;this.render()});
  }
  private configure(){
    const p=this.fixed??this.progress;
    this.trigger?.kill();this.lenis?.destroy();this.trigger=null;this.lenis=null;
    const staticMode=this.quality.staticMode;document.body.classList.toggle('is-static',staticMode);
    document.body.dataset.motionMode=staticMode?'reduced':'full';
    if(!staticMode){
      this.lenis=new Lenis({autoRaf:false,lerp:.085,smoothWheel:true,syncTouch:false});
      this.lenis.on('scroll',ScrollTrigger.update);
      this.trigger=ScrollTrigger.create({trigger:this.track,start:'top top',end:'bottom bottom',onUpdate:s=>{if(this.fixed===null)this.progress=s.progress}});
    }
    this.resize();this.progress=p;this.render();
  }
  private resize=()=>{
    const viewport=this.quality.viewport();
    this.host.resize(viewport);Object.values(this.modules).forEach(m=>m.resize(viewport));this.bridge.resize(viewport);
    if(this.fixed===null&&!this.quality.staticMode){const p=this.progress;ScrollTrigger.refresh();this.lenis?.resize();this.lenis?.scrollTo(p*Math.max(0,this.track.offsetHeight-innerHeight),{immediate:true,force:true})}
    this.render();
  };
  private bindEvents(){
    const signal=this.abort.signal;
    window.addEventListener('resize',this.resize,{signal});
    window.addEventListener('pageshow',()=>{this.lenis?.resize();ScrollTrigger.refresh();this.render()},{signal});
    document.addEventListener('visibilitychange',()=>{this.hidden=document.hidden;this.render()},{signal});
    window.addEventListener('dialog:change',((event:CustomEvent<{open:boolean}>)=>{this.blocked=event.detail.open;if(this.blocked)this.lenis?.stop();else this.lenis?.start();this.render()}) as EventListener,{signal});
    document.addEventListener('pointermove',event=>{if(!this.blocked&&event.pointerType==='mouse'){this.pointer={x:(event.clientX/innerWidth-.5)*2,y:(event.clientY/innerHeight-.5)*2}}},{signal,passive:true});
    this.roots.gallery.addEventListener('gallery-context-lost',()=>{this.handoffsReady=false;this.handoffCandidate=false;document.body.dataset.assetsReady='fallback';this.render()},{signal});
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;if(!target)return;
      const go=target.closest<HTMLElement>('[data-story-goto]');
      if(go){event.preventDefault();document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());this.go(go.dataset.storyGoto as SceneId)}
      if(target.closest('.motion-toggle')){this.paused=!this.paused;const button=document.querySelector<HTMLButtonElement>('.motion-toggle')!;button.setAttribute('aria-pressed',String(this.paused));button.setAttribute('aria-label',this.paused?'Resume ambient motion':'Pause ambient motion');button.title=this.paused?'Resume motion':'Pause motion';button.innerHTML=`<span aria-hidden="true">${this.paused?'▷':'Ⅱ'}</span>`}
      const work=target.closest<HTMLElement>('[data-action="open-work"]');if(work?.dataset.work&&!this.blocked)window.dispatchEvent(new CustomEvent('morrow:open-artwork',{detail:{id:work.dataset.work,opener:work}}));
    },{signal});
  }
  go(scene:SceneId){
    if(!chapters[scene])return;
    if(this.quality.staticMode){const i=scene==='hero'?0:scene==='gallery'?1:2;document.querySelectorAll('.fallback-sections section')[i]?.scrollIntoView({behavior:'auto'});return}
    this.fixed=null;this.playDirection=0;
    this.lenis?.scrollTo(chapters[scene].anchor*Math.max(0,this.track.offsetHeight-innerHeight),{duration:1.5,force:true});
    history.replaceState(null,'',`${location.pathname}${location.search}#${scene}`);
  }
  private tick=(time:number,deltaMs:number)=>{
    this.lenis?.raf(time*1000);
    const dt=Math.min(.05,deltaMs/1000);
    if(!this.hidden&&!this.blocked&&!this.paused&&!this.quality.staticMode&&this.fixedTime===null)this.ambientTime+=dt;
    if(this.playDirection&&this.fixed!==null&&!this.blocked&&!this.hidden){const range=this.reviewRange();this.fixed=clamp(this.fixed+this.playDirection*dt/4*(range[1]-range[0]),range[0],range[1]);if(this.fixed===range[0]||this.fixed===range[1]){this.playDirection=0;document.body.dataset.replayState='finished'}}
    if(!this.hidden&&!this.quality.staticMode)this.render(dt);
    if(++this.frameCount%30===0&&this.fpsLabel){this.history.push(deltaMs);if(this.history.length>120)this.history.shift();this.fpsLabel.dataset.meanFrameMs=(this.history.reduce((a,b)=>a+b,0)/this.history.length).toFixed(2);this.fpsLabel.dataset.frameSamples=String(this.frameCount)}
    if(this.frameCount===this.paintReadyAt)document.body.dataset.paintReady='true';
    if(this.params.has('replay')&&this.frameCount===this.paintReadyAt+30){this.playDirection=this.params.has('reverse')?-1:1;document.body.dataset.replayState='playing'}
  };
  private frames(p:number):Record<SceneId,SceneFrame>{
    const a=phase(p,transitions.A.start,transitions.A.end),b=phase(p,transitions.B.start,transitions.B.end);
    const common={ambientTime:this.fixedTime??this.ambientTime,ambientDeltaSeconds:0,reducedMotion:this.quality.reducedMotion,quality:this.quality.quality,pointer:this.fixedTime===null?this.pointer:{x:0,y:0}};
    const hidden=this.bridge.hidden(a,b,this.handoffsReady);
    return {
      hero:{...common,progress:phase(p,0,chapters.hero.end),enter:1,exit:a,opacity:1-smooth(phase(a,.68,1)),active:p<chapters.hero.end,handoffHiddenIds:hidden.hero},
      gallery:{...common,progress:phase(p,chapters.gallery.start,chapters.gallery.end),enter:a,exit:b,opacity:smooth(phase(a,.08,.42))*(1-smooth(phase(b,.06,.78))),active:p>chapters.gallery.start&&p<chapters.gallery.end,handoffHiddenIds:hidden.gallery},
      community:{...common,progress:phase(p,chapters.community.start,1),enter:b,exit:0,opacity:smooth(phase(b,.04,.46)),active:p>chapters.community.start,handoffHiddenIds:hidden.community},
    };
  }
  private render(dt=0){
    if(this.quality.staticMode)return;
    const p=this.fixed??this.progress;
    if(this.handoffCandidate&&this.host.ready&&(p<=transitions.A.start||(p>=transitions.A.end&&p<=transitions.B.start)||p>=transitions.B.end))this.handoffsReady=true;
    const frames=this.frames(p);const a=frames.hero.exit,b=frames.community.enter;
    const copyOpacity={hero:1-smooth(phase(a,0,.29)),gallery:smooth(phase(a,.28,.65))*(1-smooth(phase(b,0,.3))),community:smooth(phase(b,.20,.58))};
    const active:SceneId=p<.33?'hero':p<.78?'gallery':'community';document.body.dataset.activeScene=active;
    for(const id of ['hero','gallery','community'] as const){const f=frames[id];f.ambientDeltaSeconds=this.paused||this.blocked||this.hidden||this.fixedTime!==null?0:dt;
      this.modules[id].update(f);this.roots[id].style.opacity=String(f.opacity);
      const interactive=id===active&&copyOpacity[id]>.6&&!this.blocked;
      this.roots[id].inert=!interactive;this.roots[id].style.pointerEvents=interactive?'auto':'none';
      this.roots[id].setAttribute('aria-hidden',String(id==='hero'||!interactive));
      const copy=this.copies[id];copy.style.opacity=String(copyOpacity[id]);copy.style.transform=`translate(${id==='gallery'&&innerWidth>680?(1-a)*innerWidth*.55:0}px,${(1-copyOpacity[id])*12}px)`;copy.inert=!interactive;copy.setAttribute('aria-hidden',String(!interactive));
      const aux=document.querySelector<HTMLElement>(`[data-aux="${id}"]`)!;aux.style.opacity=String(copyOpacity[id]);aux.inert=!interactive;
    }
    this.roots.hero.style.maskImage=a>0?`linear-gradient(to right,#000 ${Math.max(0,65-60*a)}%,transparent ${Math.max(0,90-80*a)}%)`:'none';
    const galleryReveal=Math.max(0,(90-80*a)*(1-smooth(phase(a,.75,1))));
    this.roots.gallery.style.maskImage=a<1?`linear-gradient(to right,transparent ${galleryReveal}%,#000 ${galleryReveal+8*(1-a)}%)`:b>0?`linear-gradient(to right,transparent ${120*smooth(b)}%,#000 ${120*smooth(b)+12}%)`:'none';
    this.bridge.update(a,b,frames,this.handoffsReady);this.host.render();
    document.querySelectorAll<HTMLButtonElement>('.chapter-nav button').forEach(n=>{if(n.dataset.storyGoto===active)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current')});
    if(this.fpsLabel){this.fpsLabel.dataset.progress=p.toFixed(6);this.fpsLabel.dataset.ambientTime=(this.fixedTime??this.ambientTime).toFixed(4);this.fpsLabel.dataset.handoffsReady=String(this.handoffsReady)}
    this.syncReview(p);
  }
  private reviewRange():[number,number]{return this.reviewMode==='A'?[transitions.A.start,transitions.A.end]:this.reviewMode==='B'?[transitions.B.start,transitions.B.end]:[0,1]}
  private syncReview(p:number){if(!this.fpsLabel||this.fpsLabel.hidden)return;const [start,end]=this.reviewRange();const q=clamp((p-start)/(end-start));this.fpsLabel.querySelector<HTMLInputElement>('input[type=range]')!.value=String(Math.round(q*1000));this.fpsLabel.querySelector('output')!.textContent=`${(q*100).toFixed(1)}%`}
  private configureReview(){
    if(['A','B'].includes(this.params.get('replay')||'')){this.reviewMode=this.params.get('replay')!;const range=this.reviewRange();this.fixed=range[this.params.has('reverse')?1:0];this.fixedTime=0;document.body.dataset.replayState='ready';this.render()}
    const panel=this.fpsLabel;if(!panel||!this.params.has('review'))return;panel.hidden=false;this.fixed??=this.progress;this.fixedTime??=0;
    const signal=this.abort.signal;
    panel.addEventListener('click',event=>{const el=event.target instanceof Element?event.target.closest<HTMLElement>('button'):null;if(!el)return;
      if(el.dataset.reviewMode){this.reviewMode=el.dataset.reviewMode;this.fixed=this.reviewRange()[0];this.playDirection=0}
      if(el.dataset.reviewPlay)this.playDirection=Number(el.dataset.reviewPlay);
      if(el.dataset.reviewKey){const [start,end]=this.reviewRange();this.fixed=start+Number(el.dataset.reviewKey)*(end-start);this.playDirection=0}
      if(el.hasAttribute('data-review-live')){this.fixed=null;this.playDirection=0;this.fixedTime=null;panel.querySelector<HTMLInputElement>('[data-review-time]')!.checked=false;this.progress=this.trigger?.progress??0}
      this.render();
    },{signal});
    panel.querySelector('input[type=range]')!.addEventListener('input',event=>{const [start,end]=this.reviewRange();this.fixed=start+Number((event.target as HTMLInputElement).value)/1000*(end-start);this.playDirection=0;this.render()},{signal});
    panel.querySelector('[data-review-time]')!.addEventListener('change',event=>{this.fixedTime=(event.target as HTMLInputElement).checked?0:null;this.render()},{signal});
  }
  dispose(){gsap.ticker.remove(this.tick);this.abort.abort();this.removeMedia();this.trigger?.kill();this.lenis?.destroy();this.bridge.dispose();Object.values(this.modules).forEach(m=>m.dispose());this.host.dispose()}
}
