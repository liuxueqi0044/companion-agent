import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readRevision } from '../../core/store.mjs'
import { authorSourceHash } from '../validation/validate.mjs'
import { AuthorWorkspace } from '../workspace/workspace.mjs'

const root = path.resolve(fileURLToPath(new URL('../../../../../', import.meta.url)))
const oldStore = path.join(root,'reports/evidence/BATCH-012/model-store')
const oldEvidence = path.join(root,'reports/evidence/BATCH-013')
const evidence = path.join(root,'reports/evidence/BATCH-013-R1')
const workspaceId = 'model-v1-r1-revalidation'
function once(text, before, after) {
  const index = text.indexOf(before)
  if (index < 0 || text.indexOf(before,index+before.length) >= 0) throw new Error('model_source_shape_changed')
  return text.slice(0,index) + after + text.slice(index+before.length)
}
export function developerRevision(files) {
  const html = files['view.html']
  const start = html.indexOf('<main class="wrap">')
  const end = html.indexOf('</main>',start)
  if (start < 0 || end < 0 || html.indexOf('<main class="wrap">',start+1) >= 0)
    throw new Error('model_html_shape_changed')
  const fragment = html.slice(start,end+'</main>'.length)
  let js = files['view.js']
  const oldSetup = '  var binding = {channel_id:"",revision_id:"",request_id:"",artifact_hash:"",base_revision:""};\n'
    + '  var port = null;\n'
    + '  var state = null;\n'
    + '  var list = document.getElementById("list");\n'
    + '  var status = document.getElementById("status");\n'
    + '  function send(type,payload){ if(port) port.postMessage({type:type,binding:binding,payload:payload||{}}); }\n'
  const newSetup = '  var state = null;\n'
    + '  var list = document.getElementById("list");\n'
    + '  var status = document.getElementById("status");\n'
  js = once(js,oldSetup,newSetup)
  const oldPersist = '  function persist(msg){\n'
    + '    if(!port) return;\n'
    + '    port.postMessage({type:"write_demo_draft",binding:binding,payload:{draft:toDraft()}});\n'
    + '    setStatus(msg||"Saved to host draft");\n'
    + '  }'
  const newPersist = '  async function persist(msg){\n'
    + '    setStatus("Saving to host draft…");\n'
    + '    try { await window.PersonalSpace.saveDraft(toDraft()); setStatus(msg||"Saved to host draft"); }\n'
    + '    catch(e) { setStatus("Save failed: " + (e.code||"unavailable")); }\n'
    + '  }'
  js = once(js,oldPersist,newPersist)
  const listenerStart = js.indexOf('  window.addEventListener("message",function(ev){')
  const listenerEnd = js.lastIndexOf('})()')
  if (listenerStart < 0 || listenerEnd < listenerStart || js.indexOf('  window.addEventListener("message",function(ev){',listenerStart+1) >= 0)
    throw new Error('model_listener_shape_changed')
  js = js.slice(0,listenerStart)
    + '  state=blank(); render();\n'
    + '  window.PersonalSpace.subscribe(function(snapshot){ applyDraft(snapshot.draft); });\n'
    + '  window.PersonalSpace.connect().catch(function(e){ setStatus("Host unavailable: " + (e.code||"unknown")); });\n'
    + js.slice(listenerEnd)
  return { 'view.html':fragment, 'view.css':files['view.css'], 'view.js':js }
}
export async function deriveModelV1() {
  const original = await readRevision(oldStore,'model-v1')
  const previous = await new AuthorWorkspace(path.join(oldEvidence,'workspaces')).read('model-v1-derivative')
  if (original.manifest.source_type !== 'model_candidate'
    || previous.meta.source_type !== 'model_candidate'
    || previous.meta.origin.original_source_hash !== original.manifest.build_input_hash)
    throw new Error('model_origin_mismatch')
  const oldSourceHash = authorSourceHash(previous.files)
  if (oldSourceHash !== previous.head.source_hash) throw new Error('old_derivative_mismatch')
  const store = new AuthorWorkspace(path.join(evidence,'workspaces'))
  let created
  try { created = await store.create({ workspace_id:workspaceId,format:'authoring-kit/1',
    files:previous.files, source_type:'model_candidate',
    origin:{ kind:'model_candidate',reference:'BATCH-013/model-v1-derivative',
      original_source_hash:original.manifest.build_input_hash },
    requested_scopes:original.manifest.requested_scopes }) }
  catch (cause) {
    if (cause.code !== 'workspace_exists_or_recovery_required') throw cause
    created = await store.read(workspaceId)
    if (created.head.source_hash !== oldSourceHash
      || created.meta.source_type !== 'model_candidate'
      || created.meta.origin.original_source_hash !== original.manifest.build_input_hash
      || created.meta.origin.reference !== 'BATCH-013/model-v1-derivative')
      throw new Error('existing_model_revalidation_mismatch')
    if (created.current_build_valid) {
      const saved = JSON.parse(await fs.readFile(path.join(evidence,'model-revalidation.json'),'utf8'))
      if (saved.revalidated_source_hash !== oldSourceHash
        || saved.build_receipt !== created.receipts.current_build.id)
        throw new Error('existing_model_evidence_mismatch')
      return saved
    }
  }
  const checked = await store.check(workspaceId)
  if (checked.validation.source_validation !== 'passed') throw new Error('old_developer_revision_invalid_under_r1')
  const built = await store.build(workspaceId)
  if (built.status !== 'built' || built.receipt.source_type !== 'model_candidate')
    throw new Error('model_lineage_lost')
  const oldBuild = previous.receipts.current_build
  const result = { status:'tool_revalidation', original_revision:'BATCH-012/model-v1',
    original_build_input_hash:original.manifest.build_input_hash,
    original_artifact_hash:original.manifest.artifact_hash,
    old_derivative_ref:'BATCH-013/model-v1-derivative',
    old_derivative_revision:previous.head.revision_id,
    old_derivative_source_hash:oldSourceHash,
    old_build_receipt:oldBuild.id,
    old_validator_hash:oldBuild.validator_hash,
    validator_hash:built.receipt.validator_hash,
    revalidated_revision:created.head.revision_id,
    revalidated_source_hash:created.head.source_hash,
    build_receipt:built.receipt.id, derived_artifact_hash:built.receipt.artifact_hash,
    source_type:'model_candidate', execution_validation:'not_run', browser_validation:'not_run',
    native_validation:'not_run', visual_validation:'not_run',
    note:'Read-only old developer revision was rechecked and rebuilt under R1 tools; no model source was executed, previewed or registered.' }
  await fs.writeFile(path.join(evidence,'model-revalidation.json'),JSON.stringify(result,null,2)+'\n')
  return result
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await deriveModelV1())+'\n') }
  catch (cause) { process.stderr.write((cause.code || cause.message) + '\n'); process.exitCode = 1 }
}
