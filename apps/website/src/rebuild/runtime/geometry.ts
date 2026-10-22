import type {Point,Quad} from '../types';
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function interpolateQuad(a:Quad,b:Quad,t:number):Quad{return a.map((p,i)=>({x:mix(p.x,b[i].x,t),y:mix(p.y,b[i].y,t)})) as unknown as Quad}
export function translateQuad(q:Quad,x:number,y:number):Quad{return q.map(p=>({x:p.x+x,y:p.y+y})) as unknown as Quad}
export function center(q:Quad):Point{return {x:q.reduce((s,p)=>s+p.x,0)/4,y:q.reduce((s,p)=>s+p.y,0)/4}}
/** Exact projective map, not a bounding-box approximation, from a unit plane to a CSS quad. */
export function quadMatrix(q:Quad,width:number,height:number):string {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Plane dimensions must be finite and positive');
  const [p0,p1,p2,p3]=q;
  const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
  const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
  const d=dx1*dy2-dx2*dy1;
  const g=Math.abs(d)>1e-8?(dx3*dy2-dx2*dy3)/d:0;
  const h=Math.abs(d)>1e-8?(dx1*dy3-dx3*dy1)/d:0;
  const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x;
  const c=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
  return `matrix3d(${a/width},${c/width},0,${g/width},${b/height},${e/height},0,${h/height},0,0,1,0,${p0.x},${p0.y},0,1)`;
}
export function foldedQuad(q:Quad,amount:number):Quad {
  const top={x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2};
  const bottom={x:(q[2].x+q[3].x)/2,y:(q[2].y+q[3].y)/2};
  return q.map((p,i)=>{const m=i<2?top:bottom;return{x:mix(m.x,p.x,amount),y:mix(m.y,p.y,amount)}}) as unknown as Quad;
}
