import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PackageError, sha } from '../core/package.mjs'
import { stageSource, sealCandidate } from '../core/store.mjs'
import { ENDPOINT, MODEL, PRICE_INPUT_USD_PER_M, PRICE_OUTPUT_USD_PER_M,
  requestPlan, sendOnce, parseResponse } from './plan.mjs'

export const PREVIOUS_LEDGER_SHA256 = '2503398cf3278e7b730b3dbae1cc493d3c6c2d77e48dc5623b24f1789064acf4'
export const PREVIOUS_LOCK_SHA256 = '44e0b3e313c7b3695c16486134d793209f39dac30fefc9f4c2884f5cbbebbfcd'
const MAX_TOTAL_USD = 0.05
const PRESEND_CATEGORIES = new Set([
  'credential_read_failed', 'credential_empty', 'credential_decode_failed', 'credential_failed',
])
const usageEmpty = () => ({ prompt_tokens:null, completion_tokens:null, total_tokens:null })
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// Only the internal test factory injects paths and an in-memory transport. The production
// worker provides fixed paths and never derives them from CLI arguments or environment.
export function createBatch012Session({ evidenceDir, previousLedgerPath, previousLockPath,
  previousLedgerRef, expectedPreviousLedgerSha256 = PREVIOUS_LEDGER_SHA256,
  expectedPreviousLockSha256 = PREVIOUS_LOCK_SHA256, docsPath,
  transport = fetch, clock = () => new Date(), sendTimeoutMs = 90_000 }) {
  const ledgerPath = path.join(evidenceDir, 'live-attempts.json')
  const lockPath = path.join(evidenceDir, 'live.lock')
  const sourceRoot = path.join(evidenceDir, 'model-store')
  const at = () => clock().toISOString()

  async function history() {
    let previousBytes, lockBytes
    try {
      previousBytes = await fs.readFile(previousLedgerPath)
      lockBytes = await fs.readFile(previousLockPath)
    } catch { throw new PackageError('history_unavailable') }
    const previousHash = sha(previousBytes)
    const lockHash = sha(lockBytes)
    if (previousHash !== expectedPreviousLedgerSha256 || lockHash !== expectedPreviousLockSha256)
      throw new PackageError('history_hash_mismatch')
    let prior
    try { prior = JSON.parse(previousBytes.toString('utf8')) }
    catch { throw new PackageError('history_invalid') }
    if (!isObject(prior) || prior.schema !== 1 || !Array.isArray(prior.attempts)
      || prior.attempts.length !== 1 || !isObject(prior.attempts[0]))
      throw new PackageError('history_invalid')
    const record = prior.attempts[0]
    if (record.attempt !== 1 || record.state !== 'failed_pre_send' || record.sent_at_utc !== null
      || !Number.isFinite(record.estimated_max_usd) || record.estimated_max_usd < 0)
      throw new PackageError('history_invalid')
    return { previousHash, lockHash, previousEstimatedMaxUsd:record.estimated_max_usd }
  }

  async function documents() {
    let docs
    try { docs = JSON.parse(await fs.readFile(docsPath, 'utf8')) }
    catch { throw new PackageError('docs_recheck_required') }
    if (!isObject(docs) || docs.utc_date !== at().slice(0, 10)
      || docs.pricing_url !== 'https://api-docs.deepseek.com/quick_start/pricing/'
      || docs.chat_completion_url !== 'https://api-docs.deepseek.com/api/create-chat-completion/'
      || docs.model !== MODEL || docs.endpoint !== ENDPOINT
      || docs.peak_cache_miss_input_usd_per_million !== PRICE_INPUT_USD_PER_M
      || docs.peak_output_usd_per_million !== PRICE_OUTPUT_USD_PER_M
      || docs.json_object_supported !== true || docs.thinking_disabled_supported !== true)
      throw new PackageError('docs_recheck_required')
    return docs
  }

  async function boundedPlan() {
    const previous = await history()
    const docs = await documents()
    const request = requestPlan(1)
    const combined = previous.previousEstimatedMaxUsd + request.estimatedMaximumUsd
    if (!Number.isFinite(combined) || combined > MAX_TOTAL_USD)
      throw new PackageError('budget_exceeded')
    return { previous, docs, request, combined }
  }

  async function readLedger() {
    let value
    try { value = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) }
    catch (error) {
      if (error?.code === 'ENOENT') return null
      throw new PackageError('ledger_invalid')
    }
    if (!isObject(value) || value.schema !== 1 || value.previous_ledger_ref !== previousLedgerRef
      || value.previous_ledger_sha256 !== expectedPreviousLedgerSha256
      || value.previous_lock_sha256 !== expectedPreviousLockSha256
      || value.global_attempts_used !== 2 || value.exhausted !== true
      || !Array.isArray(value.attempts) || value.attempts.length !== 1
      || !isObject(value.attempts[0]) || value.attempts[0].local_attempt !== 1
      || value.attempts[0].global_attempt !== 2
      || !['reserved', 'sent_unknown', 'failed_pre_send', 'failed', 'candidate_valid']
        .includes(value.attempts[0].state)) throw new PackageError('ledger_invalid')
    return value
  }

  async function saveLedger(value) {
    const temp = path.join(evidenceDir, 'ledger-' + randomUUID() + '.tmp')
    const handle = await fs.open(temp, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8')
      await handle.sync()
    } finally { await handle.close() }
    await fs.rename(temp, ledgerPath)
    // Windows does not provide a portable directory fsync here; the file is synced
    // before same-directory rename, without claiming absolute power-loss durability.
  }

  async function lockVerified(token) {
    if (typeof token !== 'string' || token.length < 20) throw new PackageError('launcher_required')
    let actual
    try { actual = await fs.readFile(lockPath, 'utf8') }
    catch { throw new PackageError('lock_missing') }
    if (actual !== token) throw new PackageError('lock_mismatch')
  }

  async function plan() {
    const request = requestPlan(1)
    return { mode:'plan', provider_phase:1, global_attempt:2, network_calls:0,
      credential_reads:0, message_bytes:request.messageBytes,
      estimated_max_usd:request.estimatedMaximumUsd }
  }
  async function offline() {
    const { previous, docs, request, combined } = await boundedPlan()
    const existing = await readLedger()
    return { mode:'offline', available:existing === null, historical_attempts:1,
      global_next_attempt:2, exhausted:existing !== null, network_calls:0, credential_reads:0,
      docs_utc_date:docs.utc_date, previous_ledger_sha256:previous.previousHash,
      previous_lock_sha256:previous.lockHash, message_bytes:request.messageBytes,
      estimated_max_usd:request.estimatedMaximumUsd, combined_estimated_max_usd:combined }
  }
  async function reserve(token) {
    await lockVerified(token)
    const { previous, docs, request, combined } = await boundedPlan()
    if (await readLedger() !== null) throw new PackageError('attempts_exhausted')
    const entry = { local_attempt:1, global_attempt:2, provider_phase:1, phase:'generate',
      state:'reserved', created_at_utc:at(), sent_at_utc:null, finished_at_utc:null,
      request_id:null, model_requested:MODEL, model_returned:null, finish_reason:null,
      http_status:null, usage:usageEmpty(), candidate_hash:null, artifact_hash:null,
      validation:null, error_category:null, message_bytes:request.messageBytes,
      estimated_max_usd:request.estimatedMaximumUsd,
      combined_estimated_max_usd:combined, estimated_usage_cost_usd:null }
    await saveLedger({ schema:1, previous_ledger_ref:previousLedgerRef,
      previous_ledger_sha256:previous.previousHash, previous_lock_sha256:previous.lockHash,
      docs_utc_date:docs.utc_date, global_attempts_used:2, exhausted:true,
      attempts:[entry] })
    return { state:'reserved', local_attempt:1, global_attempt:2,
      estimated_max_usd:entry.estimated_max_usd, combined_estimated_max_usd:combined }
  }
  async function markPresendFailure(token, category) {
    await lockVerified(token)
    if (!PRESEND_CATEGORIES.has(category)) throw new PackageError('presend_category_invalid')
    const current = await readLedger()
    const entry = current?.attempts[0]
    if (!entry || entry.state !== 'reserved' || entry.sent_at_utc !== null)
      throw new PackageError('presend_state_required')
    entry.state = 'failed_pre_send'
    entry.error_category = category
    entry.finished_at_utc = at()
    await saveLedger(current)
    return { state:entry.state, local_attempt:1, global_attempt:2,
      error_category:category, network_requests_sent:0 }
  }
  async function execute(token, key) {
    await lockVerified(token)
    const current = await readLedger()
    const entry = current?.attempts[0]
    if (!entry || entry.state !== 'reserved' || entry.sent_at_utc !== null)
      throw new PackageError('reservation_required')
    if (typeof key !== 'string' || !key) throw new PackageError('credential_missing')
    const { request, combined } = await boundedPlan()
    if (entry.estimated_max_usd !== request.estimatedMaximumUsd
      || entry.combined_estimated_max_usd !== combined
      || entry.message_bytes !== request.messageBytes)
      throw new PackageError('plan_changed')
    entry.state = 'sent_unknown'
    entry.sent_at_utc = at()
    await saveLedger(current) // Potential send recorded before the single transport call.
    try {
      const response = await sendOnce(key, request, transport, sendTimeoutMs)
      entry.http_status = response.http_status
      if (response.http_status !== 200) throw new PackageError('http_error')
      if (response.body.includes(key)) throw new PackageError('credential_echo_detected')
      const parsed = parseResponse(response.body, 1)
      entry.request_id = parsed.request_id
      entry.model_returned = parsed.model_returned
      entry.finish_reason = parsed.finish_reason
      entry.usage = parsed.usage
      if (parsed.usage.prompt_tokens !== null && parsed.usage.completion_tokens !== null)
        entry.estimated_usage_cost_usd = (parsed.usage.prompt_tokens * PRICE_INPUT_USD_PER_M
          + parsed.usage.completion_tokens * PRICE_OUTPUT_USD_PER_M) / 1_000_000
      await fs.mkdir(sourceRoot, { recursive:true })
      await stageSource(sourceRoot, { package_id:'fictional-three-things',
        revision_id:'model-v1', base_revision:null, host_api_version:'demo/1',
        source_type:'model_candidate', requested_scopes:['read_demo_state','write_demo_draft'],
        changes:parsed.files })
      const sealed = await sealCandidate(sourceRoot, 'model-v1')
      if (sealed.manifest.build_input_hash !== parsed.manifest.build_input_hash
        || sealed.manifest.artifact_hash !== parsed.manifest.artifact_hash)
        throw new PackageError('candidate_hash_mismatch')
      entry.candidate_hash = sealed.manifest.build_input_hash
      entry.artifact_hash = sealed.manifest.artifact_hash
      entry.validation = 'source_structure_passed_execution_not_run'
      entry.state = 'candidate_valid'
    } catch (error) {
      entry.state = 'failed'
      entry.validation = 'failed'
      entry.error_category = error instanceof PackageError ? error.code : 'internal_error'
    }
    entry.finished_at_utc = at()
    await saveLedger(current)
    return { state:entry.state, local_attempt:1, global_attempt:2,
      error_category:entry.error_category, http_status:entry.http_status,
      request_id:entry.request_id, model_returned:entry.model_returned,
      finish_reason:entry.finish_reason, usage:entry.usage,
      candidate_hash:entry.candidate_hash, artifact_hash:entry.artifact_hash,
      estimated_usage_cost_usd:entry.estimated_usage_cost_usd }
  }
  return { plan, offline, reserve, execute, markPresendFailure }
}
