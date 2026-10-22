import type { HandoffAnchor, Quad, SceneFrame, SceneModule, Viewport } from '../types';
import { communityAssetVersion, communityPeople, communityWorks } from '../content/community';
import '../styles/community.css';

type Box = {x:number;y:number;w:number;h:number;r:number};
type Layout = { works:Box[]; people:Box[]; set:Box; ribbons:Box[]; distant:Box[]; scale:number };
const box=(x:number,y:number,w:number,h:number,r=0):Box=>({x,y,w,h,r});
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const desktopWorks=[box(935,132,450,300,-5),box(1350,318,385,256.667,-4),box(970,529,450,300,3)];
const desktopPeople=[box(744,31,197,300),box(1467,34,196,302),box(691,371,237,300),box(742,626,190,296),box(1570,622,219,300)];
const desktopDistant=[
 box(596,169,125,90,-7),box(667,86,68,104,7),box(624,294,46,79,-8),box(627,439,111,152,-7),
 box(811,294,101,115,4),box(878,569,64,118,-6),box(646,719,91,130,-4),box(960,855,151,77,2),
 box(1317,42,85,143,4),box(1677,83,91,145,-4),box(1801,156,88,136,-5),box(1376,208,44,87,3),
 box(1720,553,66,100,3),box(1829,644,108,159,5),box(1443,670,117,127,-4),box(1352,835,69,89,5),
 box(1174,823,111,74,-2),box(882,729,42,103,4),box(1789,407,80,113,-2),box(1689,790,102,77,5),
];

/** Composition units are CSS pixels. Mobile is authored individually, not a scaled desktop. */
export function communityLayout(v:Viewport):Layout {
 if(v.layout==='mobile'){
  const s=v.width/390, y=Math.min(Math.max(376,390*s),v.height-395*s);
  const b=(x:number,dy:number,w:number,h:number,r=0)=>box(x*s,y+dy*s,w*s,h*s,r);
  return {scale:s,works:[b(82,36,185,123.333,-5),b(208,139,150,100,-4),b(82,224,180,120,3)],
   people:[b(19,-2,70,106),b(295,0,68,104),b(8,125,82,106),b(11,244,65,98),b(292,243,75,102)],
   set:b(-175,35,590,295),ribbons:[b(2,121,360,114,-5),b(18,262,350,115,-3)],
   distant:[b(5,40,35,53,-5),b(64,0,24,35,5),b(272,54,31,42,-5),b(339,61,38,52,7),b(12,199,35,48,-3),b(277,215,27,46,3),b(340,220,37,48,-3),b(71,316,42,29,4),b(170,318,29,25,-2),b(338,301,35,42,6),b(50,106,26,39,4),b(165,9,25,36,-4),b(232,12,23,33,4),b(350,124,28,39,5),b(186,209,24,32,-3),b(63,212,20,33,4),b(273,304,21,33,4),b(4,306,25,35,-4),b(126,315,31,23,2),b(219,314,25,30,-4)]};
 }
 const s=Math.min(v.width/1920,v.height/920), offsetX=v.width/1920<1&&v.height/v.width>.57?v.width*.037:0;
 const offsetY=(v.height-960*s)/2;
 const fit=(b:Box):Box=>({...b,x:b.x*s+offsetX,y:b.y*s+offsetY,w:b.w*s,h:b.h*s});
 return {scale:s,works:desktopWorks.map(fit),people:desktopPeople.map(fit),set:fit(box(0,0,1920,960)),
  ribbons:[fit(box(627,517,790,262,-6)),fit(box(1276,724,682,227,-7))],distant:desktopDistant.map(fit)};
}

function project(b:Box):Quad {
 const r=b.r*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=b.x+b.w/2,cy=b.y+b.h/2;
 return [[-b.w/2,-b.h/2],[b.w/2,-b.h/2],[b.w/2,b.h/2],[-b.w/2,b.h/2]].map(([x,y])=>({x:cx+x*c-y*s,y:cy+x*s+y*c})) as unknown as Quad;
}
function position(el:HTMLElement,b:Box){el.style.width=`${b.w}px`;el.style.height=`${b.h}px`;el.style.transform=`translate3d(${b.x}px,${b.y}px,0) rotate(${b.r}deg)`;}
function img(src:string,className:string,alt=''){const el=document.createElement('img');el.className=className;el.src=src;el.alt=alt;el.draggable=false;el.decoding='async';return el;}
function fallbackBox(v:Viewport):Box {
 if(v.layout==='mobile'){const s=v.width/390;return box(-180*s,Math.min(411*s,v.height-330*s),570*s,285*s);}
 const w=Math.min(v.width,v.height*2);return box((v.width-w)/2,(v.height-w/2)/2,w,w/2);
}

export function createCommunityScene(root:HTMLElement):SceneModule {
 const scene=document.createElement('div');scene.className='community-art';scene.setAttribute('aria-label','An open world of assistant concepts and illustrated creators');
 // Runtime alpha edge treatment suppresses generator matte contamination at display size.
 // The preserved master and all lossless source alpha remain unchanged.
 const defs=document.createElementNS('http://www.w3.org/2000/svg','svg');defs.setAttribute('width','0');defs.setAttribute('height','0');defs.setAttribute('aria-hidden','true');
 defs.innerHTML='<defs><filter id="morrow-community-alpha" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="erode" radius=".7" result="edge"/><feGaussianBlur in="edge" stdDeviation=".18" result="soft-edge"/><feComposite in="SourceGraphic" in2="soft-edge" operator="in"/></filter></defs>';scene.append(defs);
 const failDiagnostic=new URLSearchParams(location.search).get('assetFail')==='community';
 const set=img(failDiagnostic?'/rebuild/community/__diagnostic-missing-required-image.webp':'/rebuild/community/set-clean.webp','community-set');scene.append(set);
 const distant=Array.from({length:20},(_,i)=>{
  const wrap=document.createElement('div');wrap.className='community-distant';wrap.setAttribute('aria-hidden','true');
  wrap.append(img(`/rebuild/community/distant-${i+1}.webp`,'community-distant-image'));scene.append(wrap);return wrap;
 });
 const people=communityPeople.map((person,i)=>{
  const wrap=document.createElement('div');wrap.className=`community-person community-person-${i+1}`;wrap.setAttribute('aria-hidden','true');
  const body=document.createElement('div');body.className='community-person-body';body.append(img(person.src,'community-person-image'));
  if(person.greeting){const greeting=document.createElement('span');greeting.className='community-greeting';greeting.textContent=person.greeting;body.append(greeting);}
  wrap.append(body);scene.append(wrap);return {wrap,body};
 });
 const ribbons=[0,1].map(i=>{const el=img('/rebuild/community/ribbon.webp',`community-ribbon community-ribbon-${i+1}`);scene.append(el);return el;});
 const cards=communityWorks.map((work,i)=>{
  const wrap=document.createElement('div');wrap.className=`community-work-position community-work-position-${i+1}`;wrap.dataset.workInstance=work.id;
  const card=document.createElement('article');card.className='community-work';card.dataset.work=work.id;
  card.append(img(work.src,'community-work-image',`${work.title}: ${work.description}`));
  const copy=document.createElement('div');copy.className='community-work-copy';
  const title=document.createElement('h3');title.textContent=work.title;copy.append(title);
  const desc=document.createElement('p');desc.textContent=work.description;copy.append(desc);card.append(copy);
  const actions=document.createElement('div');actions.className='community-work-actions';
  for(const action of ['Share','Discuss','Buy','Sell']){const button=document.createElement('button');button.type='button';button.dataset.action='open-work';button.dataset.work=work.id;button.dataset.intent=action.toLowerCase();button.setAttribute('aria-label',`${action}: ${work.title}`);button.textContent=action;actions.append(button);}
  const arrow=document.createElement('button');arrow.type='button';arrow.className='community-work-arrow';arrow.dataset.action='open-work';arrow.dataset.work=work.id;arrow.setAttribute('aria-label',`Explore ${work.title}`);arrow.textContent='↗';actions.append(arrow);card.append(actions);
  wrap.append(card);scene.append(wrap);return {wrap,card};
 });
 const fallback=document.createElement('div');fallback.className='community-fallback';fallback.hidden=true;
 const poster=img('/rebuild/fallback/community.webp','community-fallback-poster','Five illustrated creators share travel, companion and writing concepts among flowing silk ribbons and olive branches.');
 const posterStage=document.createElement('div');posterStage.className='community-fallback-stage';posterStage.append(poster);
 // These broad hit regions follow the fallback poster, not the different layered production anchors.
 const fallbackRegions=[box(.484,.098,.238,.347),box(.739,.255,.218,.346),box(.508,.490,.230,.363)];
 const fallbackButtons=communityWorks.map((work,i)=>{const button=document.createElement('button');button.type='button';button.className='community-fallback-work';button.dataset.action='open-work';button.dataset.work=work.id;button.setAttribute('aria-label',`Explore ${work.title}`);const b=fallbackRegions[i];button.style.cssText=`left:${b.x*100}%;top:${b.y*100}%;width:${b.w*100}%;height:${b.h*100}%`;posterStage.append(button);return button;});
 fallback.append(posterStage);root.append(scene,fallback);root.dataset.communityState='loading';
 let viewport:Viewport={width:1920,height:960,dpr:1,layout:'desktop'},layout=communityLayout(viewport),disposed=false,lastFrame:SceneFrame|undefined;
 let fallbackActive=false,fallbackPromise:Promise<'fallback'>|undefined;
 const abort=new AbortController();
 function activateFallback():Promise<'fallback'>{
  if(fallbackPromise)return fallbackPromise;
  fallbackActive=true;
  if(!disposed){scene.hidden=true;scene.inert=true;fallback.hidden=false;root.dataset.communityState='fallback';if(lastFrame)fallbackButtons.forEach(button=>button.inert=!lastFrame!.active);}
  fallbackPromise=poster.decode().catch(()=>{if(!disposed){poster.style.visibility='hidden';fallback.dataset.posterState='failed';}}).then(()=>'fallback');
  return fallbackPromise;
 }
 const sceneImages=Array.from(scene.querySelectorAll('img'));
 sceneImages.forEach(el=>el.addEventListener('error',()=>{void activateFallback();},{once:true,signal:abort.signal}));
 const ready:Promise<'ready'|'fallback'>=Promise.all(sceneImages.map(el=>el.decode().then(()=>true).catch(()=>false))).then(results=>{
  if(fallbackActive||!results.every(Boolean))return activateFallback();
  if(!disposed)root.dataset.communityState='ready';return 'ready';
 });
 function resize(v:Viewport){
  if(disposed)return;viewport=v;layout=communityLayout(v);scene.style.setProperty('--community-scale',`${layout.scale}`);
  scene.classList.toggle('community-mobile',v.layout==='mobile');
  position(posterStage,fallbackBox(v));
  position(set,layout.set);distant.forEach((el,i)=>position(el,layout.distant[i]));people.forEach((p,i)=>position(p.wrap,layout.people[i]));ribbons.forEach((el,i)=>position(el,layout.ribbons[i]));cards.forEach((c,i)=>{position(c.wrap,layout.works[i]);c.card.style.setProperty('--community-scale',`${layout.scale}`);});
  if(lastFrame)update(lastFrame);
 }
 function update(frame:SceneFrame){
  if(disposed)return;lastFrame=frame;
  if(fallbackActive){fallbackButtons.forEach(button=>button.inert=!frame.active);return;}
  const entry=frame.reducedMotion?1:clamp(frame.enter),ambient=frame.reducedMotion?0:frame.ambientTime;
  set.style.opacity=`${smooth((entry-.06)/.66)}`;
  distant.forEach((el,i)=>{el.style.opacity=`${.45*smooth((entry-.04-i*.008)/.6)}`;});
  people.forEach(({body},i)=>{const reveal=smooth((entry-.32-i*.045)/.39);body.style.opacity='1';body.style.transform=`translate3d(0,${(1-reveal)*1.08*layout.people[i].h+Math.sin(ambient*.47+i*.9)*2.2*layout.scale}px,0)`;});
  ribbons.forEach((el,i)=>{el.style.opacity=`${.83*smooth((entry-.19-i*.11)/.55)}`;});
  cards.forEach(({wrap},i)=>{const hidden=frame.handoffHiddenIds.includes(communityWorks[i].id);wrap.style.visibility=hidden?'hidden':'visible';wrap.inert=!frame.active||hidden;});
 }
 resize(viewport);
 return {ready,resize,update,sampleHandoff(instanceId:string,_frame:SceneFrame):HandoffAnchor|undefined{
  const i=communityWorks.findIndex(w=>w.id===instanceId);if(i<0||disposed||fallbackActive)return;
  const b=layout.works[i],work=communityWorks[i];
  return {instanceId,assetId:work.id,assetVersion:communityAssetVersion,quad:project(b),uv:{x:0,y:0,w:1,h:1},appearanceId:'morrow-work-3x2',occlusionGroup:'community-ribbon-front',src:work.src,width:b.w,height:b.h,borderRadius:10*layout.scale,element:cards[i].card};
 },dispose(){if(disposed)return;disposed=true;abort.abort();scene.remove();fallback.remove();delete root.dataset.communityState;lastFrame=undefined;}};
}
