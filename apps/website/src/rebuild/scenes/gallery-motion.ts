import type { SceneFrame, Viewport } from '../types';
export type GalleryMotionCard = { band:number; index:number; count:number; asset:{tier:string} };
export type GalleryPose = { x:number; y:number; z:number; width:number; height:number; rx:number; ry:number; rz:number; opacity:number };
const clamp = (v:number) => Math.min(1,Math.max(0,v));
const smooth = (a:number,b:number,v:number) => {const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const wrap = (v:number,p:number) => ((v%p)+p)%p;

export function galleryLoop(card:GalleryMotionCard,viewport:Viewport){
 const {width:w,layout}=viewport, band=card.band, mobile=layout==='mobile',tablet=layout==='tablet';
 const baseWidth=mobile?[77,83,168,222][band]:tablet?[102,111,235,300][band]:[114,120,280,Math.min(340,w*.24)][band];
 const variation=Math.sin(card.index*2.39996+band);
 const size=Math.min(card.asset.tier==='restricted'?120:band===2?280:Infinity,baseWidth*(1+variation*.045));
 const spacing=baseWidth*[1.16,1.13,1.13,1.10][band];
 const period=Math.max(card.count*spacing,w+size*3);
 const speed=(mobile?[7,-8,-13,17]:[11,-13,-22,29])[band];
 const index=band===3?[0,2,3,4,1,5,6,7][card.index]:card.index;
 return {size,spacing,period,speed,index,variation,duration:period/Math.abs(speed)};
}

/** Stateless: reverse, seek, elapsed clocks and resizing use the same evaluation. */
export function galleryPose(card:GalleryMotionCard,viewport:Viewport,current:SceneFrame):GalleryPose {
 const {width:w,height:h,layout}=viewport, mobile=layout==='mobile';
 const t=current.reducedMotion?0:current.ambientTime, band=card.band;
 const pointerX=current.reducedMotion?0:current.pointer.x, pointerY=current.reducedMotion?0:current.pointer.y;
 const availableH=mobile?Math.max(310,h-320):h*.72;
 const top=mobile?335:h*.24;
 const entrance=smooth(.15,.9,current.enter);
 const openingScale=.9+.1*entrance;
 const openingX=w*.30*(1-entrance);
 const finish=(p:GalleryPose):GalleryPose=>{
  const exit=band<4?smooth(0,1,current.exit):0;
  const retreatScale=1-.16*exit;
  const enteredX=w*.5+(p.x-w*.5)*openingScale+openingX;
  const enteredY=top+(p.y-top)*openingScale;
  return {...p,x:w*.5+(enteredX-w*.5)*retreatScale+w*.30*exit,
   y:h*.5+(enteredY-h*.5)*retreatScale-availableH*.075*exit,
   width:p.width*openingScale*retreatScale,height:p.height*openingScale*retreatScale};
 };
 if(band===4){
  const prep=smooth(.56,.71,current.progress);
  const size=mobile?Math.min(190,w*.49):Math.min(340,w*.245);
  const x=w*(mobile?[.28,.77,.50][card.index]:[.38,.77,.57][card.index]);
  const y=top+availableH*(mobile?[.27,.53,.80][card.index]:[.31,.52,.80][card.index]);
  const drift=(1-prep)*Math.sin(t*.10+card.index*1.9)*(mobile?18:78);
  return finish({x:x+drift,y:y+(1-prep)*Math.sin(t*.12+card.index)*18,z:145+card.index,width:size,height:size/1.5,rx:0,ry:(1-prep)*.11,rz:[-.055,.043,-.025][card.index]*(1-prep*.45),opacity:smooth(.46,.61,current.progress)});
 }
 const loop=galleryLoop(card,viewport);
 if(band===3&&(card.index===0||card.index===4)){
  // A's two identities must never inherit the modulo jump of a recycled rail.
  // They arrive at authored anchors and join a closed, continuous orbit after A.
  // This remains safe even when the user pauses A for minutes or seeks backwards.
  const second=card.index===4, release=smooth(.329,.50,current.progress);
  const angle=t*.08+(second?Math.PI:0);
  const anchorX=w*(second?(mobile?.66:.53):.25);
  const anchorY=mobile?top+availableH*(second?.72:.34):h*(second?.745:.49);
  const amplitudeX=w*(mobile?.13:second?.21:.18),amplitudeY=mobile?25:h*.06;
  const x=anchorX+Math.sin(angle)*amplitudeX*release;
  const y=anchorY+(Math.cos(angle)-(second?-1:1))*amplitudeY*release;
  const nx=(x/w-.5)*2;
  return finish({x:x+pointerX*6,y:y+pointerY*4,z:91+(second?1:0),width:loop.size,height:loop.size/1.5,
   rx:.025,ry:Math.max(-.5,Math.min(.5,-nx*.32)),rz:(second?-.018:.035)+Math.sin(angle)*.032*release,
   opacity:1-smooth(.56,.72,current.progress)*.48});
 }
 const x=wrap(loop.index*loop.spacing+t*loop.speed+loop.period*.5-w*.25,loop.period)-loop.period*.5+w/2;
 const nx=(x/w-.5)*2;
 let y:number;
 if(mobile) y=top+availableH*[.13,.82,.40,.68][band]+Math.sin(nx*1.15+band*.68)*24;
 else {
  // Four coordinated ribbons bend upward to the right. Their curvature and
  // tangent rotation are shared, giving a continuous sweep rather than rows.
  const base=[.30,.83,.49,.75][band]*h;
  const bow=[12,70,60,110][band],slope=[.07*h,45,80,40][band];
  y=base-nx*nx*bow-nx*slope;
 }
 y+=Math.sin(t*.14+card.index*1.9)*(current.reducedMotion?0:2.2);
 const prep=smooth(.56,.72,current.progress),retreat=prep*(band===3?.48:.12);
 const tangent=mobile?-nx*.10:(-2*nx*[12,70,60,110][band]-[.07*h,45,80,40][band])*2/w;
 return finish({x:x+pointerX*[1,2,4,6][band],y:y+pointerY*[1,1.5,2,4][band],z:[-70,-60,0,80][band],width:loop.size,height:loop.size/1.5,
  rx:[.03,-.02,-.02,.035][band],ry:Math.max(-.62,Math.min(.62,-nx*.40)),rz:Math.max(-.20,Math.min(.20,-Math.atan(tangent)*.63+loop.variation*.016)),opacity:(band<2?.65:1)*(1-retreat)});
}
