/** Only trusted construction may inject this provider; no runtime lookup exists here. */
export const UnavailableContactProvider=Object.freeze({
  configured:false,
  async reassess(){throw new Error('model_not_configured')},
})

const reasons=new Set(['still_relevant','resolved','recent_contact','not_useful','later'])
export function contactReply(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).some(key=>key!=='decision'))return null
  const decision=value.decision
  if(!decision || typeof decision!=='object' || Array.isArray(decision) ||
    Object.keys(decision).some(key=>!['disposition','reason','text','due_at'].includes(key)) ||
    !reasons.has(decision.reason))return null
  if(decision.disposition==='send'){
    if(typeof decision.text!=='string' || !decision.text.trim() ||
      Buffer.byteLength(decision.text,'utf8')>4096 || decision.due_at!=null)return null
  }else if(decision.disposition==='defer'){
    if(typeof decision.due_at!=='string' || !decision.due_at || decision.text!=null)return null
  }else if(decision.disposition==='cancel'){
    if(decision.text!=null || decision.due_at!=null)return null
  }else return null
  try{return {decision:structuredClone(decision)}}catch{return null}
}
