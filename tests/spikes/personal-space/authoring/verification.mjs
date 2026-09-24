import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sha } from '../core/package.mjs'
import { AuthorWorkspace } from './workspace/workspace.mjs'

const repo = path.resolve(fileURLToPath(new URL('../../../../',import.meta.url)))
const evidence = path.join(repo,'reports/evidence/BATCH-013-R1')
const manifestFile = path.join(evidence,'artifact-manifest.json')
const posix = value => value.split(path.sep).join('/')
async function walk(dir) {
  const files = []
  for (const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const target = path.join(dir,entry.name)
    if (entry.isSymbolicLink()) throw new Error('manifest_reparse_point')
    if (entry.isDirectory()) files.push(...await walk(target))
    else if (entry.isFile()) files.push(target)
    else throw new Error('manifest_non_regular')
  }
  return files
}
const hash = async file => sha(await fs.readFile(file))
export async function makeArtifactManifest() {
  const sources = await walk(path.join(repo,'tests/spikes/personal-space/authoring'))
  const model = await walk(path.join(evidence,'workspaces/model-v1-r1-revalidation'))
  const selected = [...sources,...model,path.join(evidence,'model-revalidation.json'),
    path.join(evidence,'ui-integration.md')].sort()
  if (selected.some(file => /(?:^|[\\/])(lock|tmp-[^\\/]*|node_modules|dist)(?:[\\/]|$)/.test(file)))
    throw new Error('manifest_exclusion_violation')
  const items = []
  for (const file of selected) {
    const bytes = await fs.readFile(file)
    const relative = posix(path.relative(repo,file))
    items.push({ path:relative, sha256:sha(bytes), bytes:bytes.length,
      origin:relative.includes('/workspaces/model-v1-r1-revalidation/')
        ? 'model_candidate_tool_revalidation_unexecuted'
        : relative.endsWith('model-revalidation.json') ? 'developer_static_provenance'
          : 'handwritten_implementation_fixture_or_handoff' })
  }
  const derivative = JSON.parse(await fs.readFile(path.join(evidence,'model-revalidation.json'),'utf8'))
  const manifest = { batch_id:'BATCH-013-R1', format:'artifact-manifest/1', count:items.length,
    items, model_derivative:{ original_revision:derivative.original_revision,
      original_build_input_hash:derivative.original_build_input_hash,
      original_artifact_hash:derivative.original_artifact_hash,
      old_derivative_ref:derivative.old_derivative_ref,
      old_derivative_source_hash:derivative.old_derivative_source_hash,
      revalidated_revision:derivative.revalidated_revision,
      revalidated_source_hash:derivative.revalidated_source_hash,
      derived_artifact_hash:derivative.derived_artifact_hash,
      source_type:'model_candidate',execution_validation:'not_run' },
    exclusions:'Reports, logs, test scratch workspaces, CLI smoke workspaces, dependencies, caches and secrets are excluded.' }
  await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n')
  return { count:items.length, result_ref:'sha256:'+await hash(manifestFile) }
}
export async function verifyArtifactsAndHistory() {
  const manifest = JSON.parse(await fs.readFile(manifestFile,'utf8'))
  if (manifest.count !== manifest.items.length) throw new Error('manifest_count')
  for (const item of manifest.items) {
    const file = path.join(repo,...item.path.split('/'))
    const bytes = await fs.readFile(file)
    if (bytes.length !== item.bytes || sha(bytes) !== item.sha256)
      throw new Error('manifest_mismatch:'+item.path)
  }
  const baseline = JSON.parse(await fs.readFile(path.join(repo,'docs/handoff/BATCH-013-R1-BASELINE.json'),'utf8'))
  const fixed = new Map(baseline.files.map(item=>[item.path,item.sha256]))
  const historical = ['reports/evidence/BATCH-011/live-attempts.json',
    'reports/evidence/BATCH-011/live.lock','reports/evidence/BATCH-012/live-attempts.json',
    ...['view.html','view.css','view.js','manifest.json','artifact.html'].map(name=>
      'reports/evidence/BATCH-012/model-store/revisions/model-v1/'+name),
    'reports/BATCH-013.json','reports/BATCH-013.md',
    'reports/evidence/BATCH-013/artifact-manifest.json',
    'reports/evidence/BATCH-013/model-derivation.json',
    ...[...fixed.keys()].filter(name=>name.startsWith('reports/evidence/BATCH-013/workspaces/model-v1-derivative/'))]
  const history = []
  for (const relative of historical) {
    const current = await hash(path.join(repo,...relative.split('/')))
    if (!fixed.has(relative) || current !== fixed.get(relative)) throw new Error('historical_hash_mismatch:'+relative)
    history.push({path:relative,sha256:current})
  }
  const derivative = JSON.parse(await fs.readFile(path.join(evidence,'model-revalidation.json'),'utf8'))
  const modelWorkspace = await new AuthorWorkspace(path.join(evidence,'workspaces')).read('model-v1-r1-revalidation')
  if (modelWorkspace.meta.source_type !== 'model_candidate' || !modelWorkspace.current_build_valid
    || modelWorkspace.head.source_hash !== derivative.revalidated_source_hash
    || modelWorkspace.receipts.current_build.artifact_hash !== derivative.derived_artifact_hash
    || modelWorkspace.meta.origin.original_source_hash !== derivative.original_build_input_hash)
    throw new Error('model_derivation_mismatch')
  const oldWorkspace = await new AuthorWorkspace(path.join(repo,'reports/evidence/BATCH-013/workspaces'))
    .read('model-v1-derivative')
  if (oldWorkspace.meta.source_type !== 'model_candidate'
    || oldWorkspace.head.source_hash !== derivative.old_derivative_source_hash
    || oldWorkspace.current_build_valid) throw new Error('old_model_derivative_provenance_mismatch')
  const result = { result:'PASS', manifest_items:manifest.items.length,
    result_ref:'sha256:'+await hash(manifestFile), historical_files:history,
    original_model_build_input_hash:derivative.original_build_input_hash,
    derived_source_type:'model_candidate', model_execution:'not_run' }
  await fs.writeFile(path.join(evidence,'integrity-final.json'),JSON.stringify(result,null,2)+'\n')
  return result
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2]
  const result = command === 'manifest' ? await makeArtifactManifest()
    : command === 'verify' ? await verifyArtifactsAndHistory() : (()=>{throw new Error('unknown_command')})()
  process.stdout.write(JSON.stringify(result)+'\n')
}
