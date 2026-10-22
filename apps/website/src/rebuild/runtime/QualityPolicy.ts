import type {Quality,Viewport} from '../types';
export class QualityPolicy {
  private media=window.matchMedia('(prefers-reduced-motion: reduce)');
  private params=new URLSearchParams(location.search);
  get reducedMotion(){return this.media.matches || this.params.get('motion')==='reduce'}
  get quality():Quality {return this.params.get('quality')==='static'?'static':innerWidth<768?'balanced':'full'}
  get staticMode(){return this.reducedMotion || this.quality==='static'}
  viewport():Viewport{return {width:innerWidth,height:innerHeight,dpr:Math.min(devicePixelRatio||1,innerWidth<768?1.5:2),layout:innerWidth<=680?'mobile':innerWidth<1024?'tablet':'desktop'}}
  listen(callback:()=>void){this.media.addEventListener('change',callback);return()=>this.media.removeEventListener('change',callback)}
}
