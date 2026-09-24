/** Process-local ownership for trusted lanes sharing the exact same host object. */
const hosts=new WeakMap()

export function registerExecutionOwner(host,lane) {
  if(!host || typeof host.request!=='function' || !['turn','contact'].includes(lane))
    throw new TypeError('trusted_execution_owner_required')
  let shared=hosts.get(host)
  if(!shared){shared={owners:new Map(),lease:null,unknown:false};hosts.set(host,shared)}
  if(shared.owners.has(lane))throw new Error('runner_owned')
  let disposed=false
  const owner={lane}
  shared.owners.set(lane,owner)
  function claim({readOnly=false}={}) {
    if(disposed)return {ok:false,error:'disposed'}
    if(shared.lease)return {ok:false,error:'runner_busy'}
    if(shared.unknown && !readOnly)return {ok:false,error:'reconciliation_required'}
    const lease={owner,released:false,release(){
      if(this.released)return
      this.released=true
      if(shared.lease===this)shared.lease=null
      if(disposed && shared.owners.get(lane)===owner)shared.owners.delete(lane)
    }}
    shared.lease=lease
    return {ok:true,lease}
  }
  return {
    claim,
    markUnknown(){shared.unknown=true},
    get needsReconciliation(){return shared.unknown},
    dispose(){
      if(disposed)return
      disposed=true
      if(!shared.lease || shared.lease.released || shared.lease.owner!==owner)
        shared.owners.delete(lane)
    },
  }
}
