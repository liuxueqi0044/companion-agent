import type { HandoffAnchor, SceneFrame, SceneModule, Viewport } from '../types';
import '../styles/hero.css';

const SOURCE = { width:1774, height:887 };
const BASE = '/rebuild/hero/';
const TAGS = [
  { id:'hero-tag-video', label:'Video Editing', src:'tag-video.webp', x:174, y:150, w:174, h:236,
    tether:{src:'tether-video.webp', x:241, y:73, w:52, h:112} },
  { id:'hero-tag-research', label:'Research', src:'tag-research.webp', x:496, y:591, w:162, h:214,
    tether:{src:'tether-research.webp', x:551, y:533, w:43, h:86} },
] as const;
let instanceCounter = 0;
const clamp = (n:number) => Math.max(0,Math.min(1,n));
const ease = (n:number) => { const p=clamp(n); return p*p*(3-2*p); };
const zeroFrame:SceneFrame = {progress:0,enter:0,exit:0,opacity:1,active:true,ambientTime:0,ambientDeltaSeconds:0,reducedMotion:false,quality:'full',pointer:{x:0,y:0},handoffHiddenIds:[]};

/** Photographic hero. All geometry is derived from the approved image coordinate space. */
export function createHeroScene(root:HTMLElement):SceneModule {
  const id = `hero-patch-${++instanceCounter}`;
  let viewport:Viewport = {width:1920,height:960,dpr:1,layout:'desktop'};
  let art = {x:0,y:0,width:1920,height:960,scale:1920/SOURCE.width};
  let latestFrame = zeroFrame;
  let failed = false;
  let disposed = false;
  root.classList.add('morrow-hero');
  root.setAttribute('aria-hidden','true');
  root.innerHTML = `<div class="morrow-hero__wash"></div>
    <div class="morrow-hero__composition">
      <img class="morrow-hero__master" src="${BASE}hero-master.webp" width="1774" height="887" alt="" decoding="async" fetchpriority="high" />
      <svg class="morrow-hero__patches" viewBox="0 0 1774 887" aria-hidden="true">
        <defs>
          <filter id="${id}-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" /></filter>
          <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1774" height="887">
            <g fill="white" filter="url(#${id}-feather)">
              <rect x="161" y="137" width="200" height="263" rx="15" />
              <rect x="235" y="67" width="64" height="128" rx="14" />
              <rect x="484" y="578" width="187" height="241" rx="15" />
              <rect x="546" y="528" width="53" height="99" rx="13" />
            </g>
          </mask>
        </defs>
        <image href="${BASE}hero-cleanplate.webp" width="1774" height="887" mask="url(#${id})" />
      </svg>
      ${TAGS.map(tag=>`<img class="morrow-hero__tether" data-tether="${tag.id}" src="${BASE}${tag.tether.src}" alt="" decoding="async" style="left:${tag.tether.x/SOURCE.width*100}%;top:${tag.tether.y/SOURCE.height*100}%;width:${tag.tether.w/SOURCE.width*100}%;height:${tag.tether.h/SOURCE.height*100}%" />
        <div class="morrow-hero__tag" data-instance-id="${tag.id}" style="left:${tag.x/SOURCE.width*100}%;top:${tag.y/SOURCE.height*100}%;width:${tag.w/SOURCE.width*100}%;height:${tag.h/SOURCE.height*100}%">
          <div class="morrow-hero__tag-face"><img src="${BASE}${tag.src}" width="${tag.w}" height="${tag.h}" alt="" decoding="async" /></div>
        </div>`).join('')}
      <img class="morrow-hero__foreground" src="${BASE}hero-master.webp" width="1774" height="887" alt="" decoding="async" />
    </div>`;
  const composition = root.querySelector<HTMLElement>('.morrow-hero__composition')!;
  const foreground = root.querySelector<HTMLElement>('.morrow-hero__foreground')!;
  const patch = root.querySelector<SVGElement>('.morrow-hero__patches')!;
  const tagElements = new Map(TAGS.map(tag=>[tag.id,root.querySelector<HTMLElement>(`[data-instance-id="${tag.id}"]`)!]));
  const tethers = new Map(TAGS.map(tag=>[tag.id,root.querySelector<HTMLElement>(`[data-tether="${tag.id}"]`)!]));

  // Decode the net plate explicitly: SVG <image> has no decode() readiness contract.
  const netPlate = new Image(); netPlate.src = `${BASE}hero-cleanplate.webp`;
  const images = [...root.querySelectorAll<HTMLImageElement>('img'),netPlate];
  const ready:Promise<'ready'|'fallback'> = Promise.all(images.map(image=>image.decode())).then(()=> {
    if (disposed) return 'fallback';
    root.classList.add('morrow-hero--ready');
    return 'ready';
  }).catch(()=> {
    failed = true;
    patch.style.display = 'none';
    tagElements.forEach(element=>element.style.display='none');
    tethers.forEach(element=>element.style.display='none');
    root.classList.add('morrow-hero--fallback');
    return 'fallback';
  });

  function pose(frame:SceneFrame) {
    const motion = !frame.reducedMotion && frame.quality !== 'static';
    const ambientX = motion ? Math.sin(frame.ambientTime*.18)*1.4 + frame.pointer.x*2.2 : 0;
    const ambientY = motion ? Math.sin(frame.ambientTime*.13)*.8 + frame.pointer.y*1.25 : 0;
    // This is deliberately the same evaluation for rendering and handoff sampling.
    const retreat = ease((frame.exit-.06)/.9);
    return {x:art.x - art.width*.43*retreat + ambientX, y:art.y + ambientY, retreat};
  }
  function resize(next:Viewport) {
    if (disposed) return;
    viewport = next;
    const mobile = next.layout === 'mobile';
    if (mobile) {
      const width = next.width * (650/390);
      const height = width/2;
      // Independent phone composition keeps the art below the actual copy.
      const top = Math.max(338,Math.min(next.height*.482,next.height-height-80));
      art = {x:-5*(next.width/390),y:top,width,height,scale:width/SOURCE.width};
    } else {
      const width = next.width;
      const height = width/2;
      art = {x:0,y:(next.height-height)/2,width,height,scale:width/SOURCE.width};
    }
    root.dataset.layout = mobile ? 'mobile' : next.layout;
    composition.style.width = `${art.width}px`;
    composition.style.height = `${art.height}px`;
    const fade = mobile ? Math.min(28,art.height*.075) : art.y>12 ? Math.min(52,art.y*.7) : 0;
    composition.style.setProperty('--hero-edge-fade',`${fade}px`);
    update(latestFrame);
  }
  function update(frame:SceneFrame) {
    if (disposed) return;
    latestFrame = frame;
    const p = pose(frame);
    composition.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
    const motion = !frame.reducedMotion && frame.quality !== 'static';
    foreground.style.transform = motion ? `translate3d(${frame.pointer.x*4+Math.sin(frame.ambientTime*.15)*1.2}px,${frame.pointer.y*2}px,0)` : 'none';
    TAGS.forEach(tag=> {
      const hidden = frame.handoffHiddenIds.includes(tag.id);
      tagElements.get(tag.id)!.style.visibility = hidden ? 'hidden' : 'visible';
      tethers.get(tag.id)!.style.visibility = hidden ? 'hidden' : 'visible';
    });
  }
  function sampleHandoff(instanceId:string,frame:SceneFrame):HandoffAnchor|undefined {
    if (disposed || failed) return undefined;
    const tag = TAGS.find(tag=>tag.id===instanceId);
    if (!tag) return undefined;
    const p = pose(frame);
    const x=p.x+tag.x*art.scale, y=p.y+tag.y*art.scale;
    const width=tag.w*art.scale, height=tag.h*art.scale;
    return {instanceId,assetId:tag.id,assetVersion:'m02-hero-1',
      quad:[{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}],
      uv:{x:0,y:0,w:1,h:1}, appearanceId:'paper-tag',occlusionGroup:'hero-middle',
      src:BASE+tag.src,width,height,borderRadius:9*art.scale,
      element:tagElements.get(tag.id)!.firstElementChild as HTMLElement};
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.replaceChildren();
    root.classList.remove('morrow-hero','morrow-hero--ready','morrow-hero--fallback');
    delete root.dataset.layout;
  }
  resize(viewport);
  return {ready,resize,update,sampleHandoff,dispose};
}
