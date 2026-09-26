/** View preference only. Runtime, conversation and draft ownership stay in the host. */
import {initialStarter,availableStarterIds} from './starter-config.mjs'
export const STARTERS = Object.freeze([
  {id:'whale',name:'蓝鲸小窝',eyebrow:'BLUE HOUR',description:'一片可以一起散步的蓝。',note:'可活动的伙伴 · 蓝色场景'},
  {id:'form',name:'FORM',eyebrow:'FORM',description:'一个入口，其余留白。',note:'单一入口 · 安静的思考空间'},
  {id:'atelier',name:'ATELIER',eyebrow:'A PERSONAL JOURNAL',description:'共同写下的一本手记。',note:'双页手记 · 阅读与书写'},
].filter(item=>availableStarterIds.includes(item.id)))
export const validStarter = id => STARTERS.some(item=>item.id===id)

// Serialize view preferences separately from the shared conversation draft. A
// conflicting write rebases once on the current host value, retaining other keys.
export function createAppearanceStore({state,initial=initialStarter,onChange=()=>{},onError=()=>{}}){
  let theme=validStarter(initial)?initial:initialStarter,revision=0,value={},intent=0,initialized=false,preview=false
  let flight=Promise.resolve()
  function apply(id){theme=id;onChange(id)}
  async function read(){
    const result=await state.read()
    if(result.ok){revision=result.result.revision;value=result.result.value??{};return true}
    if(result.error==='preview_read_only'){preview=true;return false}
    throw Error(result.error||'appearance_read_failed')
  }
  function initialize(){
    if(initialized)return flight
    initialized=true;const started=intent
    flight=flight.then(async()=>{
      if(await read()&&intent===started&&validStarter(value.starterTheme))apply(value.starterTheme)
    }).catch(e=>onError(e.message))
    return flight
  }
  function select(id){
    if(!validStarter(id))return Promise.reject(Error('invalid_starter'))
    intent++;apply(id);initialize()
    flight=flight.then(async()=>{
      if(preview)return
      for(let attempt=0;attempt<2;attempt++){
        const next={...value,starterTheme:id}
        const result=await state.write({expectedRevision:revision,value:next})
        if(result.ok){revision=result.result.revision;value=next;return}
        if(result.error==='preview_read_only'){preview=true;return}
        if(result.error==='revision_conflict'&&attempt===0){await read();continue}
        throw Error(result.error||'appearance_write_failed')
      }
    }).catch(e=>onError(e.message))
    return flight
  }
  return {initialize,select,get theme(){return theme},settled:()=>flight}
}
