'use strict'
// Construct a support document, never redact/copy a raw log or runtime snapshot.
const knownErrors=new Set(['model_not_configured','credential_rejected','provider_insufficient_balance','provider_rate_limited','provider_timeout','provider_invalid_output','provider_aborted','provider_busy','provider_failed','transport_unavailable','request_in_progress','ledger_locked','ledger_invalid','background_failed','background_state_invalid'])
const errorCode=v=>v==null?null:knownErrors.has(v)?v:'other_error'
const version=v=>typeof v==='string'&&/^\d+(?:\.\d+){1,3}(?:[-+][0-9a-zA-Z.-]{1,40})?$/.test(v)?v:null
function diagnosticReport({release={},versions={},status={},notification={},owned=false}={}){
  const connection=status.connection??{},background=status.background??{}
  return {format:'morrow-support/1',created_at:new Date().toISOString(),
    release:{version:version(release.version),channel:['invitation-alpha','local-preview'].includes(release.channel)?release.channel:'unknown',signed:release.signed===true},
    runtime:{platform:process.platform,arch:process.arch,electron:version(versions.electron),node:version(versions.node),chrome:version(versions.chrome)},
    service:{reachable:status.reachable===true,owned:owned===true,busy:status.busy===true},
    model:{configured:connection.configured===true,provider:connection.provider==='DeepSeek'?'DeepSeek':null,busy:connection.busy===true,last_error:errorCode(connection.lastError)},
    background:{running:background.running===true,paused:background.paused===true,notifications:background.notifications===true,busy:background.busy===true,last_error:errorCode(background.lastError)},
    notification:{supported:notification.supported===true,phase:['idle','submitted','failed','unsupported'].includes(notification.phase)?notification.phase:'unknown'},
    privacy:{contains_conversations:false,contains_memory:false,contains_paths:false,contains_credentials:false,automatic_upload:false}}
}
module.exports={diagnosticReport}
