import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { PackageError } from '../core/package.mjs'
import { readRevision, stageSource, sealCandidate } from '../core/store.mjs'
import { MODEL, ENDPOINT, requestPlan, sendOnce, parseResponse } from './plan.mjs'
import { authorizeAttempt } from './policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const evidence = path.resolve(here, '../../../../reports/evidence/BATCH-011')
const ledgerPath = path.join(evidence, 'live-attempts.json')
const lockPath = path.join(evidence, 'live.lock')
const sourceRoot = path.join(evidence, 'model-store')
const reviewPath = path.join(evidence, 'v1-review.json')
const docsPath = path.join(evidence, 'deepseek-doc-check.json')
const now = () => new Date().toISOString()
const emptyLedger = () => ({ schema:1, attempts:[] })
async function ledger() {
  try {
    const value = JSON.parse(await fs.readFile(ledgerPath, 'utf8'))
    if (value.schema !== 1 || !Array.isArray(value.attempts) || value.attempts.length > 2)
      throw new PackageError('ledger_invalid')
    return value
  } catch (error) { if (error?.code === 'ENOENT') return emptyLedger(); throw error }
}
async function save(value) {
  const temp = path.join(evidence, 'ledger-' + randomUUID() + '.tmp')
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag:'wx', mode:0o600 })
  await fs.rename(temp, ledgerPath)
}
async function lockVerified() {
  const expected = process.env.PERSONAL_SPACE_ATTEMPT_TOKEN
  if (!expected || expected.length < 20) throw new PackageError('launcher_required')
  const actual = await fs.readFile(lockPath, 'utf8')
  if (actual !== expected) throw new PackageError('lock_mismatch')
}
async function planFor(phase) {
  const docs = JSON.parse(await fs.readFile(docsPath, 'utf8'))
  if (docs.utc_date !== now().slice(0,10) || docs.model !== MODEL || docs.endpoint !== ENDPOINT
    || docs.peak_cache_miss_input_usd_per_million !== 0.30
    || docs.peak_output_usd_per_million !== 1.20
    || docs.json_object_supported !== true || docs.thinking_disabled_supported !== true)
    throw new PackageError('docs_recheck_required')
  const existing = await ledger()
  let base = null
  if (phase === 2) {
    const previous = await readRevision(sourceRoot, 'model-v1')
    const review = JSON.parse(await fs.readFile(reviewPath, 'utf8'))
    if (review.instruction_fit !== true || review.artifact_hash !== previous.manifest.artifact_hash)
      throw new PackageError('first_review_required')
    base = previous.files
  }
  const request = requestPlan(phase, base)
  authorizeAttempt(existing.attempts, phase, request.estimatedMaximumUsd)
  return { existing, request, base_hash:phase === 2 ? existing.attempts[0].candidate_hash : null }
}
async function reserve(phase) {
  await lockVerified()
  const { existing, request, base_hash } = await planFor(phase)
  const record = { attempt:phase, phase:phase === 1 ? 'generate' : 'modify', state:'reserved',
    created_at_utc:now(), sent_at_utc:null, finished_at_utc:null, request_id:null,
    model_requested:MODEL, model_returned:null, finish_reason:null, http_status:null,
    usage:{ prompt_tokens:null, completion_tokens:null, total_tokens:null },
    candidate_hash:null, artifact_hash:null, base_source_hash:base_hash, validation:null,
    error_category:null, message_bytes:request.messageBytes,
    estimated_max_usd:request.estimatedMaximumUsd, estimated_usage_cost_usd:null }
  existing.attempts.push(record)
  await save(existing) // Durable reservation before credential read.
  return { reserved:phase, estimated_max_usd:request.estimatedMaximumUsd,
    combined_estimated_max_usd:existing.attempts.reduce((sum, x) => sum + x.estimated_max_usd, 0) }
}
async function execute(phase) {
  await lockVerified()
  const current = await ledger()
  const entry = current.attempts.at(-1)
  if (!entry || entry.attempt !== phase || entry.state !== 'reserved') throw new PackageError('reservation_required')
  const key = process.env.PERSONAL_SPACE_DEEPSEEK_KEY
  if (!key) throw new PackageError('credential_missing')
  const docs = JSON.parse(await fs.readFile(docsPath, 'utf8'))
  if (docs.utc_date !== now().slice(0,10)) throw new PackageError('docs_recheck_required')
  let base = null
  if (phase === 2) base = (await readRevision(sourceRoot, 'model-v1')).files
  if (phase === 2 && (await readRevision(sourceRoot, 'model-v1')).manifest.build_input_hash !== entry.base_source_hash)
    throw new PackageError('base_hash_changed')
  const request = requestPlan(phase, base)
  if (request.estimatedMaximumUsd !== entry.estimated_max_usd) throw new PackageError('plan_changed')
  entry.state = 'sent_unknown'
  entry.sent_at_utc = now()
  await save(current) // Any later crash still counts this attempt as possibly sent.
  try {
    const result = await sendOnce(key, request)
    entry.http_status = result.http_status
    if (result.http_status !== 200) throw new PackageError('http_error')
    if (result.body.includes(key)) throw new PackageError('credential_echo_detected')
    const parsed = parseResponse(result.body, phase)
    entry.request_id = parsed.request_id
    entry.model_returned = parsed.model_returned
    entry.finish_reason = parsed.finish_reason
    entry.usage = parsed.usage
    if (parsed.usage.prompt_tokens !== null && parsed.usage.completion_tokens !== null)
      entry.estimated_usage_cost_usd = (parsed.usage.prompt_tokens * 0.30
        + parsed.usage.completion_tokens * 1.20) / 1_000_000
    await fs.mkdir(sourceRoot, { recursive:true })
    await stageSource(sourceRoot, { package_id:'fictional-three-things',
      revision_id:parsed.manifest.revision_id, base_revision:parsed.manifest.base_revision,
      host_api_version:'demo/1', source_type:'model_candidate',
      requested_scopes:['read_demo_state','write_demo_draft'], changes:parsed.files })
    const sealed = await sealCandidate(sourceRoot, parsed.manifest.revision_id)
    if (sealed.manifest.artifact_hash !== parsed.manifest.artifact_hash) throw new PackageError('candidate_hash_mismatch')
    entry.candidate_hash = parsed.manifest.build_input_hash
    entry.artifact_hash = parsed.manifest.artifact_hash
    entry.validation = 'source_structure_passed_execution_not_run'
    entry.state = 'candidate_valid'
  } catch (error) {
    entry.state = 'failed'
    entry.validation = 'failed'
    entry.error_category = error instanceof PackageError ? error.code : 'internal_error'
  }
  entry.finished_at_utc = now()
  await save(current)
  return { attempt:phase, state:entry.state, error_category:entry.error_category,
    request_id:entry.request_id, model_returned:entry.model_returned,
    candidate_hash:entry.candidate_hash, usage:entry.usage }
}

async function markPresendFailure(phase) {
  await lockVerified()
  const current = await ledger()
  const entry = current.attempts.at(-1)
  if (!entry || entry.attempt !== phase || entry.state !== 'reserved' || entry.sent_at_utc !== null)
    throw new PackageError('presend_state_required')
  const category = process.env.PERSONAL_SPACE_PRESEND_ERROR_CATEGORY
  if (!['credential_read_failed', 'credential_empty', 'credential_decode_failed',
    'credential_failed'].includes(category)) throw new PackageError('presend_category_invalid')
  entry.state = 'failed_pre_send'
  entry.error_category = category
  entry.finished_at_utc = now()
  await save(current)
  return { attempt:phase, state:entry.state, error_category:entry.error_category,
    network_requests_sent:0 }
}

async function main(args) {
  const mode = args[0] ?? '--plan'
  if (!['--plan','--offline','--reserve','--execute','--mark-presend-failed'].includes(mode) || args.length > 2)
    throw new PackageError('invalid_arguments')
  const phase = args.length === 2 ? Number(args[1]) : 1
  if (![1,2].includes(phase)) throw new PackageError('invalid_phase')
  if (mode === '--plan') {
    const p = requestPlan(phase, phase === 2 ? { 'view.html':'', 'view.css':'', 'view.js':'' } : null)
    return { mode:'plan', phase, network_calls:0, credential_reads:0,
      message_bytes:p.messageBytes, estimated_max_usd:p.estimatedMaximumUsd }
  }
  if (mode === '--offline') {
    const p = requestPlan(1)
    return { mode:'offline', network_calls:0, credential_reads:0, message_bytes:p.messageBytes }
  }
  if (mode === '--mark-presend-failed') return markPresendFailure(phase)
  return mode === '--reserve' ? reserve(phase) : execute(phase)
}
main(process.argv.slice(2)).then(value => {
  process.stdout.write(JSON.stringify({ ok:true, ...value }) + '\n')
}, error => {
  process.stdout.write(JSON.stringify({ ok:false, code:error instanceof PackageError ? error.code : 'io_failure' }) + '\n')
  process.exitCode = 1
})
