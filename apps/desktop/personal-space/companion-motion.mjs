/** Pure decorative movement. Never schedules work, messages, or model requests. */
export const clampPosition=x=>Number.isFinite(x)?Math.max(12,Math.min(84,x)):52
const route=[34,69,48,78,24,57]
export const createCompanion=()=>({x:56,target:56,facing:-1,pose:'idle',wait:5,route:0,manual:false})
export function moveCompanion(state,target){return {...state,target:clampPosition(target),wait:0,manual:true}}
export function advanceCompanion(state,seconds,{busy=false,working=false,reduced=false,hidden=false,dragging=false,roam=true,sleep=false,greeting=false}={}){
  if(hidden)return state
  const s={...state,x:clampPosition(state.x),target:clampPosition(state.target)}
  if(busy)return {...s,target:s.x,manual:false,wait:4,pose:working?'working':'think'}
  if(dragging)return {...s,target:s.x,pose:'idle',wait:5}
  if(greeting)return {...s,pose:'celebrate',wait:4}
  if(sleep)return {...s,target:s.x,pose:'sleep',wait:5}
  if(reduced)return {...s,x:s.manual?s.target:s.x,target:s.manual?s.target:s.x,pose:'idle',manual:false,wait:5}
  if(!roam&&!s.manual)return {...s,target:s.x,pose:'idle',wait:5}
  const dt=Math.max(0,Math.min(.1,Number.isFinite(seconds)?seconds:0))
  const distance=s.target-s.x
  if(Math.abs(distance)>.03){
    const step=Math.sign(distance)*Math.min(Math.abs(distance),dt*5.5)
    return {...s,x:clampPosition(s.x+step),facing:Math.sign(distance),pose:'walk'}
  }
  s.pose='idle';s.manual=false;s.wait-=dt
  if(s.wait<=0&&roam){s.target=route[s.route%route.length];s.route++;s.wait=4+(s.route%3)}
  return s
}
