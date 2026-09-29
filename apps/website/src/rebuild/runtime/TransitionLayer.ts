import type {HandoffAnchor,Quad,SceneFrame,SceneModule,Viewport} from '../types';
import {clamp,smooth,phase} from '../config/chapters';
import {interpolateQuad,translateQuad,quadMatrix,foldedQuad} from './geometry';

type Bridge={root:HTMLDivElement; face:HTMLDivElement;src:string;cloneKey:string};
const HERO=['hero-tag-video','hero-tag-research'];
const INCOMING=['gallery-frame','gallery-fieldnotes'];
const WORKS=['community-travel','community-companion','community-writer'];

export class TransitionLayer {
  private bridges=new Map<string,Bridge>();
  private viewport:Viewport={width:1920,height:960,dpr:1,layout:'desktop'};
  constructor(private root:HTMLElement,private hero:SceneModule,private gallery:SceneModule,private community:SceneModule){root.setAttribute('aria-hidden','true');root.style.pointerEvents='none'}
  resize(v:Viewport){this.viewport=v}
  hidden(a:number,b:number,enabled=true){return {
    hero:enabled&&a>0&&a<1?HERO:[],
    gallery:enabled?[...(a>0&&a<1?INCOMING:[]),...(b>0&&b<1?WORKS:[])]:[],
    community:enabled&&b<1?WORKS:[],
  }}
  private bridge(id:string){let item=this.bridges.get(id);if(!item){const root=document.createElement('div');root.className='transition-object';const face=document.createElement('div');face.className='transition-face';root.append(face);this.root.append(root);item={root,face,src:'',cloneKey:''};this.bridges.set(id,item)}return item}
  private paint(id:string,anchor:HandoffAnchor,quad:Quad,options:{clone?:boolean;alpha?:number;radius?:number}={}){
    const item=this.bridge(id);const key=options.clone&&anchor.element?anchor.assetId:'image';
    if(item.cloneKey!==key){item.face.replaceChildren();item.cloneKey=key;item.src='';
      if(options.clone&&anchor.element){const clone=anchor.element.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');clone.removeAttribute('inert');clone.removeAttribute('aria-hidden');clone.tabIndex=-1;
        clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
        clone.querySelectorAll('button,a,input').forEach(n=>{(n as HTMLElement).tabIndex=-1});
        clone.style.cssText+=';position:absolute!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:100%!important;height:100%!important;transform:none!important;opacity:1!important;visibility:visible!important;';
        item.face.append(clone);
      }
    }
    if(key==='image'&&item.src!==anchor.src){item.src=anchor.src;item.face.style.backgroundImage=`url("${anchor.src}")`}
    if(key==='image'){
      const c=anchor.uv;item.face.style.backgroundSize=c.w===1&&c.h===1?'100% 100%':`${100/c.w}% ${100/c.h}%`;
      item.face.style.backgroundPosition=`${c.w===1?50:c.x/(1-c.w)*100}% ${c.h===1?50:c.y/(1-c.h)*100}%`;
    }else item.face.style.backgroundImage='none';
    const w=anchor.width||600,h=anchor.height||400;
    item.root.classList.toggle('community-mobile',this.viewport.layout==='mobile');
    if(options.clone&&anchor.element&&item.face.firstElementChild){const scale=anchor.element.style.getPropertyValue('--community-scale');if(scale)(item.face.firstElementChild as HTMLElement).style.setProperty('--community-scale',scale)}
    item.root.style.width=`${w}px`;item.root.style.height=`${h}px`;item.root.style.transform=quadMatrix(quad,w,h);
    item.root.style.opacity=String(options.alpha??1);item.root.style.display='block';item.root.style.visibility='visible';
    item.face.style.borderRadius=`${options.radius??anchor.borderRadius??8}px`;
  }
  update(a:number,b:number,frames:{hero:SceneFrame;gallery:SceneFrame;community:SceneFrame},enabled=true){
    // Cloned faces have explicit visibility, which overrides an ancestor's hidden
    // visibility. Remove the whole bridge from layout when it does not own a card.
    this.bridges.forEach(o=>{o.root.style.display='none';o.root.style.visibility='hidden'});
    if(!enabled)return;
    const mobile=this.viewport.layout==='mobile';
    if(a>0&&a<1)HERO.forEach((id,i)=>{
      const source=this.hero.sampleHandoff?.(id,{...frames.hero,exit:0});
      const destination=this.gallery.sampleHandoff?.(INCOMING[i],frames.gallery);
      if(!source||!destination)return;
      const t=smooth(clamp((a-i*.035)/(1-i*.035)));
      let q=interpolateQuad(source.quad,destination.quad,t);
      q=translateQuad(q,Math.sin(Math.PI*t)*(mobile?(i?26:-18):(i?90:45)),Math.sin(Math.PI*t)*(mobile?(i?-28:12):(i?-110:-50)));
      const flip=phase(t,.23,.53),fold=Math.max(.016,Math.abs(Math.cos(Math.PI*flip)));
      q=foldedQuad(q,fold);
      const face=t<.38?source:destination;
      this.paint(id,face,q,{clone:t<.38,alpha:1,radius:t<.38?source.borderRadius:destination.borderRadius});
      this.bridges.get(id)!.root.style.filter=`drop-shadow(0 ${10*smooth(t)}px ${15*smooth(t)}px rgba(87,70,45,${.13*smooth(t)}))`;
    });
    if(b>0&&b<1)WORKS.forEach((id,i)=>{
      const source=this.gallery.sampleHandoff?.(id,{...frames.gallery,exit:0});
      const destination=this.community.sampleHandoff?.(id,{...frames.community,enter:1});
      if(!source||!destination)return;
      const t=smooth(clamp((b-i*.028)/(1-i*.028)));
      let q=interpolateQuad(source.quad,destination.quad,t);
      q=translateQuad(q,Math.sin(Math.PI*t)*(mobile?10:(i===1?34:-40)),Math.sin(Math.PI*t)*(mobile?(i===2?15:-24):(i===2?46:-40)));
      this.paint(id,destination,q,{clone:true});
      const bridge=this.bridges.get(id)!;
      bridge.face.style.setProperty('--bridge-label-opacity',String(smooth(phase(b,.46,.76))));
    });
  }
  dispose(){this.bridges.forEach(o=>o.root.remove());this.bridges.clear()}
}
