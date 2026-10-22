import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createBranches } from './branches';
import { createInterfaceStream } from './interface-stream';
import { iconPaths, skills, type Artwork } from '../lib/content';

const ease = (a:number,b:number,t:number) => { const k=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return k*k*(3-2*k); };
const lerp = THREE.MathUtils.lerp;

function roundedShape(width:number,height:number,r:number) {
  const s=new THREE.Shape(), x=-width/2,y=-height/2;
  s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);
  s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}

function makeLabel(index:number) {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#f2edde';ctx.fillRect(0,0,768,1024);
  let seed=27;
  for(let i=0;i<10000;i++){
    seed=(seed*1664525+1013904223)>>>0;const x=(seed/4294967296)*768;
    seed=(seed*1664525+1013904223)>>>0;const y=(seed/4294967296)*1024;
    ctx.fillStyle=i%2?'rgba(96,91,65,.035)':'rgba(255,255,255,.18)';ctx.fillRect(x,y,1.4,1.4);
  }
  ctx.strokeStyle='#9d956f';ctx.lineWidth=4;ctx.beginPath();ctx.arc(384,75,19,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#6e705a';ctx.beginPath();ctx.arc(384,75,12,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(275,259);ctx.scale(9,9);ctx.strokeStyle='#414636';ctx.lineWidth=.9;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(new Path2D(iconPaths[skills[index].icon]));ctx.restore();
  ctx.textAlign='center';ctx.fillStyle='#353c2d';ctx.font='400 110px "DM Serif", Georgia';
  const title=skills[index].title;
  if(ctx.measureText(title).width>680){const parts=title.split(' ');ctx.fillText(parts.slice(0,-1).join(' '),384,580);ctx.fillText(parts.at(-1)!,384,710);}else ctx.fillText(title,384,652);
  ctx.fillStyle='#969982';ctx.font='400 22px "DM Sans", sans-serif';ctx.letterSpacing='4px';ctx.fillText(skills[index].short.toUpperCase(),384,879);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

type SkillCard={group:THREE.Group;base:THREE.Vector3;label:THREE.MeshBasicMaterial;body:THREE.MeshStandardMaterial;string:THREE.Line;hit:HTMLButtonElement;index:number};

function makeSkillCards() {
  const positions=[[-6.9,2.35,1],[-4.35,1.3,1],[-1.75,2.25,.8],[-6.1,-.9,1],[-3.75,-2.1,1],[-1.25,-.85,.7]];
  const group=new THREE.Group();
  const width=1.48,height=1.98;
  const bodyGeometry=new THREE.ExtrudeGeometry(roundedShape(width,height,.085),{depth:.055,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1,curveSegments:8});
  const frontGeometry=new THREE.PlaneGeometry(width-.026,height-.026);
  const eyeletGeometry=new THREE.TorusGeometry(.031,.008,6,16);
  const eyeletMaterial=new THREE.MeshStandardMaterial({color:'#9f8b5b',metalness:.62,roughness:.5});
  const cards:SkillCard[]=positions.map((pos,index)=>{
    const card=new THREE.Group();
    const body=new THREE.MeshStandardMaterial({color:'#e7e0cc',roughness:.95,metalness:0,transparent:true});
    const plaque=new THREE.Mesh(bodyGeometry,body);plaque.castShadow=true;card.add(plaque);
    const label=new THREE.MeshBasicMaterial({map:makeLabel(index),transparent:true,toneMapped:false});
    const front=new THREE.Mesh(frontGeometry,label);front.position.z=.076;card.add(front);
    const eyelet=new THREE.Mesh(eyeletGeometry,eyeletMaterial);eyelet.position.set(0,height/2-.145,.092);card.add(eyelet);
    const stringGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.06,height/2+1.15,-.12),new THREE.Vector3(.035,height/2+.56,.005),new THREE.Vector3(0,height/2-.145,.1)]);
    const string=new THREE.Line(stringGeo,new THREE.LineBasicMaterial({color:'#9c8e65',transparent:true}));card.add(string);
    group.add(card);return {group:card,base:new THREE.Vector3(...pos),label,body,string,hit:document.querySelector(`[data-skill="${index}"]`)!,index};
  });
  return {group,cards,dispose:()=>{bodyGeometry.dispose();frontGeometry.dispose();eyeletGeometry.dispose();eyeletMaterial.dispose();cards.forEach(c=>{c.label.map?.dispose();c.label.dispose();c.body.dispose();c.string.geometry.dispose();(c.string.material as THREE.Material).dispose();});}};
}

export async function initStory(assets:Artwork[]) {
  gsap.registerPlugin(ScrollTrigger);
  const mount=document.querySelector<HTMLDivElement>('#scene')!;
  const track=document.querySelector<HTMLDivElement>('#story-track')!;
  const motionButton=document.querySelector<HTMLButtonElement>('#motion-toggle')!;
  const reduceQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery=window.matchMedia('(max-width: 680px)');
  let reduced=reduceQuery.matches, mobile=mobileQuery.matches, paused=reduced, dialogOpen=false;
  let width=innerWidth,height=innerHeight,progress=0,ambient=0,disposed=false,ready=false;
  let lenis:Lenis|undefined;
  const chapterNames=['hero','assembly','gallery','community'];
  const chapters=chapterNames.map(n=>document.querySelector<HTMLElement>(`[data-chapter="${n}"]`)!);
  const preview=document.querySelector<HTMLElement>('.assistant-preview')!;
  const stageControls=document.querySelector<HTMLElement>('.story-controls')!;
  const navDots=[...document.querySelectorAll<HTMLButtonElement>('.chapter-dots button')];
  const floats=[...document.querySelectorAll<HTMLElement>('.creation,.creator')];
  const pointer=new THREE.Vector2(), smoothPointer=new THREE.Vector2();
  const raycaster=new THREE.Raycaster();
  const selected=new Set([0,1,4]);
  const skillHits=[...document.querySelectorAll<HTMLButtonElement>('[data-skill]')];
  const skillCaption=document.querySelector<HTMLElement>('#skill-caption-text')!;
  const capabilityList=document.querySelector<HTMLElement>('.assistant-capabilities')!;
  const assistantPrompt=document.querySelector<HTMLElement>('.assistant-prompt')!;
  let hoveredSkill:number|null=null;
  const cleanups:Array<()=>void>=[];
  const on=(target:EventTarget,event:string,handler:EventListener,options?:AddEventListenerOptions)=>{target.addEventListener(event,handler,options);cleanups.push(()=>target.removeEventListener(event,handler,options));};

  function goto(value:number){const target=(track.scrollHeight-height)*value; if(lenis)lenis.scrollTo(target,{duration:reduced?.01:1.75});else window.scrollTo({top:target,behavior:reduced?'instant':'smooth'});}
  document.querySelectorAll<HTMLElement>('[data-goto]').forEach(el=>on(el,'click',((event:MouseEvent)=>{event.preventDefault();goto(Number(el.dataset.goto));}) as EventListener));
  document.querySelectorAll<HTMLElement>('[data-artwork]').forEach(el=>on(el,'click',(()=>window.dispatchEvent(new CustomEvent('morrow:open-artwork',{detail:{id:el.dataset.artwork}}))) as EventListener));
  function updateMotionLabel(){motionButton.setAttribute('aria-pressed',String(paused));motionButton.setAttribute('aria-label',paused?'Play ambient motion':'Pause ambient motion');motionButton.querySelector('span')!.textContent=paused?'Play motion':'Pause motion';}
  updateMotionLabel();
  on(motionButton,'click',(()=>{paused=!paused;updateMotionLabel();}) as EventListener);
  function syncLenis(){
    if(reduced){lenis?.destroy();lenis=undefined;}
    else if(!lenis){lenis=new Lenis({lerp:.085,smoothWheel:true,autoRaf:false,anchors:false});lenis.on('scroll',ScrollTrigger.update);if(dialogOpen)lenis.stop();}
  }
  on(reduceQuery,'change',(()=>{reduced=reduceQuery.matches;paused=reduced;syncLenis();updateMotionLabel();}) as EventListener);
  on(window,'dialog:change',((event:CustomEvent)=>{dialogOpen=Boolean(event.detail.open);if(dialogOpen)lenis?.stop();else lenis?.start();}) as EventListener);
  on(window,'pointermove',((e:PointerEvent)=>{pointer.set(e.clientX/width*2-1,-e.clientY/height*2+1);}) as EventListener,{passive:true});
  on(document,'pointerleave',(()=>pointer.set(0,0)) as EventListener);

  const trigger=ScrollTrigger.create({trigger:track,start:'top top',end:'bottom bottom',onUpdate:self=>{progress=self.progress;}});
  syncLenis();
  let renderer:THREE.WebGLRenderer|undefined,scene:THREE.Scene,camera:THREE.PerspectiveCamera;
  let branch:Awaited<ReturnType<typeof createBranches>>|undefined;
  let cards:ReturnType<typeof makeSkillCards>|undefined;
  let stream:ReturnType<typeof createInterfaceStream>|undefined;
  let environment:THREE.WebGLRenderTarget|undefined;
  let branchMaterials:THREE.Material[]=[];
  let worldWidth=19,worldHeight=10, fps=60,frames=0,statsTime=0;
  let graphicsFailed=false;

  function updateCardState(index:number){
    const chosen=selected.has(index), hovering=hoveredSkill===index;
    const hit=skillHits.find(el=>Number(el.dataset.skill)===index);
    if(hit){hit.setAttribute('aria-pressed',String(chosen));hit.classList.toggle('is-selected',chosen);}
    const card=cards?.cards[index];
    card?.body.color.set(chosen?'#b8c5a6':hovering?'#ced5bd':'#e7e0cc');
    card?.label.color.set(chosen?'#e0ebcf':hovering?'#f3f7e9':'#ffffff');
  }
  function selectionCaption(){return selected.size?`${selected.size} ${selected.size===1?'skill':'skills'} in your combination. Make it your own.`:'Choose a skill to start your combination.';}
  function renderSelection(){
    skillHits.forEach(hit=>updateCardState(Number(hit.dataset.skill)));
    const chips=[...selected].map(index=>{const chip=document.createElement('span');chip.textContent=skills[index].title;return chip;});
    if(!chips.length){const empty=document.createElement('span');empty.textContent='Choose a skill to begin';chips.push(empty);}
    capabilityList.replaceChildren(...chips);
    capabilityList.setAttribute('aria-label',selected.size?'Selected assistant capabilities':'No skills selected');
    const prompt=document.createTextNode(selected.size?(selected.has(0)?'Turn these ideas into a short film.':'Bring these skills into my day.'):'Choose a skill to start your combination.');
    const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';
    assistantPrompt.replaceChildren(prompt,arrow);
    const previewName=preview.querySelector<HTMLElement>('.assistant-topbar > span:nth-child(2)');
    if(previewName)previewName.textContent=selected.size?'Your assistant':'Your assistant starts here';
    preview.setAttribute('aria-label',selected.size?'Preview of your selected skill combination':'Choose skills to shape your assistant');
  }
  skillHits.forEach(hit=>{
    const index=Number(hit.dataset.skill);
    const enter=()=>{if(progress<.15){hoveredSkill=index;skillCaption.textContent=skills[index].subtitle;updateCardState(index);}};
    const leave=()=>{if(hoveredSkill===index)hoveredSkill=null;updateCardState(index);skillCaption.textContent=selectionCaption();};
    on(hit,'pointerenter',enter as EventListener);on(hit,'focus',enter as EventListener);
    on(hit,'pointerleave',leave as EventListener);on(hit,'blur',leave as EventListener);
    on(hit,'click',(()=>{
      if(selected.has(index))selected.delete(index);else selected.add(index);
      renderSelection();
      skillCaption.textContent=selected.size?`${skills[index].title} ${selected.has(index)?'added to':'removed from'} your combination.`:selectionCaption();
    }) as EventListener);
  });
  renderSelection();

  function activateFallback(){
    graphicsFailed=true;ready=false;
    document.documentElement.classList.add('webgl-failed');document.documentElement.classList.remove('webgl-ready');
    mount.dataset.ready='fallback';
    if(renderer)renderer.domElement.style.visibility='hidden';
    skillHits.forEach(hit=>{hit.removeAttribute('style');hit.tabIndex=0;});
  }

  function setupViewport(){
    width=innerWidth;height=innerHeight;
    if(camera){camera.aspect=width/height;camera.updateProjectionMatrix();worldHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*18;worldWidth=worldHeight*camera.aspect;}
    renderer?.setSize(width,height);renderer?.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.7));
  }

  try{
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setClearColor(0xf4f1eb,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    on(renderer.domElement,'webglcontextlost',((event:Event)=>{event.preventDefault();activateFallback();}) as EventListener);
    scene=new THREE.Scene();scene.fog=new THREE.Fog('#f4f1eb',21,35);
    camera=new THREE.PerspectiveCamera(32,width/height,.1,70);camera.position.set(0,0,18);
    setupViewport();
    const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
    environment=pmrem.fromScene(room,.08);scene.environment=environment.texture;scene.environmentIntensity=.42;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#fffaf0','#b7bda2',2.2));
    const key=new THREE.DirectionalLight('#fff1d6',3.5);key.position.set(-4,7,10);key.castShadow=true;key.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
    key.shadow.camera.left=-12;key.shadow.camera.right=5;key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.camera.near=.1;key.shadow.camera.far=30;key.shadow.normalBias=.035;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key);
    const fill=new THREE.DirectionalLight('#e7eddf',1.1);fill.position.set(7,0,8);scene.add(fill);
    const rim=new THREE.DirectionalLight('#fff8e6',2.0);rim.position.set(-2,6,-3);scene.add(rim);
    const backing=new THREE.Mesh(new THREE.PlaneGeometry(50,32),new THREE.MeshStandardMaterial({color:'#f4f1eb',roughness:1,metalness:0}));
    backing.position.z=-5.3;backing.receiveShadow=true;scene.add(backing);
    await document.fonts.ready;
    if(disposed)return;
    if(graphicsFailed)throw new Error('Graphics context unavailable.');
    branch=await createBranches();
    if(disposed){branch.dispose();branch=undefined;return;}
    if(graphicsFailed)throw new Error('Graphics context unavailable.');
    scene.add(branch.group);
    branch.group.traverse(obj=>{if(obj instanceof THREE.Mesh){const materials=Array.isArray(obj.material)?obj.material:[obj.material];materials.forEach(m=>{m.transparent=true;branchMaterials.push(m);});}});
    cards=makeSkillCards();scene.add(cards.group);
    stream=createInterfaceStream(assets,{mobile});scene.add(stream.group);stream.setOpacity(0);
    renderSelection();
    ready=true;document.documentElement.classList.add('webgl-ready');mount.dataset.ready='true';
  }catch(error){
    console.warn('Morrow is using its lightweight presentation.',error);
    activateFallback();
    renderer?.dispose();renderer=undefined;mount.replaceChildren();
  }

  function showChapter(index:number,opacity:number){
    const el=chapters[index];el.style.opacity=opacity.toFixed(3);el.style.visibility=opacity>.005?'visible':'hidden';
    const inactive=opacity<.45;el.inert=inactive;el.setAttribute('aria-hidden',String(inactive));
  }
  function renderFrame(time:number,delta:number){
    if(disposed)return;
    lenis?.raf(time*1000);
    if(!paused&&!document.hidden&&!dialogOpen)ambient+=Math.min(delta/1000,.05);
    const p=progress;
    const heroAlpha=1-ease(.11,.22,p), assemblyAlpha=ease(.17,.25,p)*(1-ease(.36,.44,p));
    const galleryAlpha=ease(.38,.48,p)*(1-ease(.73,.83,p));
    const communityAlpha=ease(.77,.89,p);
    [heroAlpha,assemblyAlpha,galleryAlpha,communityAlpha].forEach((a,i)=>showChapter(i,a));
    preview.style.opacity=ease(.235,.32,p).toFixed(3);
    const previewEntry=ease(.235,.32,p), previewExit=ease(.35,.45,p);
    preview.style.transform=`translate(-50%,${lerp(35,0,previewEntry)+previewExit*60}px) scale(${lerp(.89,1,previewEntry)*lerp(1,.48,previewExit)}) rotate(${previewExit*-5}deg)`;
    const chapterIndex=p<.4?0:p<.8?1:2;
    navDots.forEach((dot,i)=>{if(i===chapterIndex)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');});
    stageControls.style.opacity=dialogOpen?'0':'1';
    floats.forEach((el,i)=>el.style.setProperty('--float',`${Math.sin(ambient*.47+i*1.5)*5}px`));
    mount.dataset.phase=chapterNames[p<.16?0:p<.4?1:p<.81?2:3];
    if(!renderer||!ready||!branch||!cards||!stream)return;
    smoothPointer.lerp(pointer,.04);
    const sway=mobile||reduced?0:1;
    camera.position.x=smoothPointer.x*.14*sway;camera.position.y=smoothPointer.y*.075*sway;camera.lookAt(0,0,0);
    const away=ease(.135,.36,p);
    const scale=mobile?worldWidth/10.3:1;
    const offsetX=mobile?worldWidth*.34:0, offsetY=mobile?-2.05:0;
    branch.group.scale.setScalar(scale);branch.group.position.set(offsetX-away*4,offsetY-away*.6,-away*2);
    branch.group.rotation.z=-away*.08;
    const branchAlpha=1-ease(.19,.34,p);
    branch.group.visible=branchAlpha>.01;
    branchMaterials.forEach(m=>{m.opacity=branchAlpha;m.depthWrite=branchAlpha>.85;});
    branch.update(ambient,reduced?0:1);
    const projected=new THREE.Vector3();
    const selectedOrder=[...selected];
    const spacing=Math.min(1.2,worldWidth*.68/Math.max(1,selectedOrder.length-1));
    cards.cards.forEach((card,index)=>{
      const order=selectedOrder.indexOf(index),chosen=order!==-1;
      const stagger=Math.max(0,order)/Math.max(1,selectedOrder.length-1);
      const gather=ease(.15+stagger*.036,.30+stagger*.028,p);
      const start=card.base.clone().multiplyScalar(scale).add(new THREE.Vector3(offsetX,offsetY,0));
      const target=new THREE.Vector3((order-(selectedOrder.length-1)/2)*spacing,mobile?-.9:-.45,2.5);
      const position=chosen?start.lerp(target,gather):start.add(new THREE.Vector3(-away*4,-away*.6,-away*2));
      card.group.position.copy(position);
      const cardScale=chosen?lerp(scale,.42,gather):scale;
      card.group.scale.setScalar(cardScale);
      const wind=reduced?0:Math.sin(ambient*.65+index*1.18)*.025;
      card.group.rotation.set(Math.sin(ambient*.4+index)*.025*(1-gather),wind+(chosen?Math.sin(gather*Math.PI)*.44:0),wind*(1-gather));
      const cardAlpha=chosen?1-ease(.27,.335,p):1-ease(.17,.30,p);
      card.group.visible=cardAlpha>.005;card.label.opacity=cardAlpha;card.body.opacity=cardAlpha;
      (card.string.material as THREE.LineBasicMaterial).opacity=(1-ease(.14,.19,p))*cardAlpha;
      projected.copy(card.group.position).project(camera);
      const projectedWidth=(1.48*cardScale/(worldWidth*(18-card.group.position.z)/18))*width;
      card.hit.style.width=`${projectedWidth}px`;card.hit.style.height=`${projectedWidth*1.338}px`;
      card.hit.style.left=`${(projected.x+1)*width/2-projectedWidth/2}px`;card.hit.style.top=`${(-projected.y+1)*height/2-projectedWidth*.669}px`;
      card.hit.tabIndex=heroAlpha>.5?0:-1;
    });
    const streamAlpha=ease(.37,.48,p)*(1-ease(.76,.90,p));
    stream.setOpacity(streamAlpha);
    stream.group.position.set(0,mobile?-1.7:-1.5,-ease(.76,.91,p)*4);
    stream.update({time:ambient,progress:ease(.35,.75,p),viewportWidth:worldWidth,viewportHeight:worldHeight,pointerX:smoothPointer.x*.5,pointerY:smoothPointer.y*.5,reducedMotion:reduced});
    renderer.render(scene,camera);
    frames++;statsTime+=delta;
    if(statsTime>2000){fps=frames*1000/statsTime;mount.dataset.fps=fps.toFixed(0);mount.dataset.drawCalls=String(renderer.info.render.calls);frames=0;statsTime=0;
      if(fps<28&&renderer.getPixelRatio()>1)renderer.setPixelRatio(1);
    }
  }
  on(window,'click',((event:MouseEvent)=>{
    if(!ready||!stream||progress<.45||progress>.76||dialogOpen||(event.target as Element)?.closest('button,a,dialog'))return;
    raycaster.setFromCamera(new THREE.Vector2(event.clientX/width*2-1,-event.clientY/height*2+1),camera);
    const hit=raycaster.intersectObjects(stream.getInteractiveMeshes(),false)[0];
    if(hit?.object.userData.asset)window.dispatchEvent(new CustomEvent('morrow:open-artwork',{detail:{id:hit.object.userData.asset.id}}));
  }) as EventListener);
  on(window,'resize',(()=>{const nextMobile=mobileQuery.matches;
    if(nextMobile!==mobile){mobile=nextMobile;if(stream&&ready){scene.remove(stream.group);stream.dispose();stream=createInterfaceStream(assets,{mobile});scene.add(stream.group);}}
    setupViewport();ScrollTrigger.refresh();
  }) as EventListener,{passive:true});
  gsap.ticker.add(renderFrame);gsap.ticker.lagSmoothing(500,33);
  ScrollTrigger.refresh();
  const hashMap:Record<string,number>={'#home':0,'#together':.35,'#possibilities':.53,'#community':.91};
  if(location.hash in hashMap)goto(hashMap[location.hash]);
  function dispose(){if(disposed)return;disposed=true;gsap.ticker.remove(renderFrame);trigger.kill();lenis?.destroy();cleanups.forEach(fn=>fn());branch?.dispose();cards?.dispose();stream?.dispose();environment?.dispose();renderer?.dispose();}
  // A bfcache snapshot resumes this same document; disposing it would leave Back frozen.
  on(window,'pagehide',((event:PageTransitionEvent)=>{if(!event.persisted)dispose();}) as EventListener);
  on(window,'pageshow',((event:PageTransitionEvent)=>{if(event.persisted&&!disposed){setupViewport();lenis?.resize();ScrollTrigger.refresh();progress=trigger.progress;}}) as EventListener);
}
