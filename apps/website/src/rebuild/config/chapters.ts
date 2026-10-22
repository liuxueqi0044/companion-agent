export const chapters = {
  hero: {start:0, holdEnd:0.15, end:0.39, anchor:0},
  gallery: {start:0.15, full:0.39, prepare:0.58, holdEnd:0.67, end:0.88, anchor:0.48},
  community: {start:0.67, full:0.88, end:1, anchor:0.94},
} as const;
export const transitions = {
  A:{start:chapters.hero.holdEnd,end:chapters.hero.end},
  B:{start:chapters.gallery.holdEnd,end:chapters.gallery.end},
} as const;
export const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
export const phase=(p:number,a:number,b:number)=>clamp((p-a)/(b-a));
export const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t)};
