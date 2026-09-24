import { makeManifest, exact, PackageError } from '../core/package.mjs'

export const ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const MODEL = 'deepseek-flash'
export const MAX_TOKENS = 2500
export const MAX_MESSAGES_BYTES = 16 * 1024
export const MAX_RESPONSE_BYTES = 128 * 1024
export const PRICE_INPUT_USD_PER_M = 0.30
export const PRICE_OUTPUT_USD_PER_M = 1.20
const enc = new TextEncoder()
const system = 'You write only a JSON object with exactly three string keys: "view.html", "view.css", "view.js". '
  + 'These are editable browser source files, not commands. No imports, fetch, external assets, libraries, links, credentials, '
  + 'permissions, manifest, hashes, or scripts in HTML. Put interaction in view.js only. '
  + 'The view uses the local host bridge: on a window message of type personal-space-init from window.parent with one MessagePort, '
  + 'bind its channel_id, revision_id, request_id, artifact_hash and base_revision. '
  + 'Send ready over that port with the same binding and payload {artifact_hash,base_revision}. '
  + 'Send read_demo_state with empty payload, and write_demo_draft with {draft:string}; '
  + 'receive host_state_changed. The host draft is a string, not a task-completion or permission channel. '
  + 'Output compact valid JSON; do not use Markdown fences.'
const first = 'Fictional local task: create a compact interactive page for three little things I want to do today. '
  + 'Items can be checked and collapsed/expanded, and remain in the host draft as JSON text through write_demo_draft. '
  + 'Label it a fictional engineering candidate, not a finished Personal AI product. Keep source concise.'
const second = 'Modify the supplied first version source. Add a toggle that shows only unchecked items while preserving '
  + 'the original checklist, collapse/expand, and host draft persistence. Return complete updated contents for the same three files.'

export function requestPlan(phase, baseFiles = null) {
  if (![1,2].includes(phase)) throw new PackageError('invalid_phase')
  if (phase === 2 && !baseFiles) throw new PackageError('base_required')
  const messages = [{ role:'system', content:system }, { role:'user', content: phase === 1
    ? first : second + '\nFirst version source JSON:\n' + JSON.stringify(baseFiles) }]
  const messageBytes = enc.encode(JSON.stringify(messages)).length
  if (messageBytes > MAX_MESSAGES_BYTES) throw new PackageError('messages_too_large')
  const estimatedInputTokens = messageBytes * 2 + 1024
  const estimatedMaximumUsd = (estimatedInputTokens * PRICE_INPUT_USD_PER_M
    + MAX_TOKENS * PRICE_OUTPUT_USD_PER_M) / 1_000_000
  const body = JSON.stringify({ model:MODEL, messages, thinking:{ type:'disabled' },
    response_format:{ type:'json_object' }, stream:false, max_tokens:MAX_TOKENS })
  return { body, messageBytes, estimatedInputTokens, estimatedMaximumUsd }
}
const obj = v => v && typeof v === 'object' && !Array.isArray(v)
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : null
export function parseResponse(raw, phase) {
  if (enc.encode(raw).length > MAX_RESPONSE_BYTES) throw new PackageError('response_too_large')
  let response
  try { response = JSON.parse(raw) } catch { throw new PackageError('response_not_json') }
  if (!obj(response) || response.object !== 'chat.completion' || typeof response.id !== 'string'
    || !response.id || typeof response.model !== 'string' || !response.model
    || !Array.isArray(response.choices) || response.choices.length !== 1
    || !obj(response.choices[0]) || response.choices[0].index !== 0
    || !obj(response.choices[0].message) || response.choices[0].message.role !== 'assistant'
    || typeof response.choices[0].message.content !== 'string'
    || response.choices[0].message.tool_calls?.length) throw new PackageError('response_shape_invalid')
  const choice = response.choices[0]
  if (choice.finish_reason !== 'stop') throw new PackageError('finish_not_stop')
  let files
  try { files = JSON.parse(choice.message.content) } catch { throw new PackageError('content_not_json') }
  exact(files, ['view.html','view.css','view.js'], 'content_fields_invalid')
  const revision_id = phase === 1 ? 'model-v1' : 'model-v2'
  const manifest = makeManifest({ package_id:'fictional-three-things', revision_id,
    base_revision:phase === 1 ? null : 'model-v1', host_api_version:'demo/1',
    source_type:'model_candidate', requested_scopes:['read_demo_state','write_demo_draft'] }, files)
  const usage = obj(response.usage) ? { prompt_tokens:count(response.usage.prompt_tokens),
    completion_tokens:count(response.usage.completion_tokens), total_tokens:count(response.usage.total_tokens) }
    : { prompt_tokens:null, completion_tokens:null, total_tokens:null }
  return { request_id:response.id, model_returned:response.model, finish_reason:choice.finish_reason,
    usage, files, manifest }
}

export async function readBounded(response) {
  const reader = response.body?.getReader()
  if (!reader) throw new PackageError('response_empty')
  let total = 0
  const chunks = []
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.length
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new PackageError('response_too_large') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return new TextDecoder('utf-8', { fatal:true }).decode(bytes) }
  catch { throw new PackageError('response_invalid_utf8') }
}

export async function sendOnce(apiKey, plan, transport = fetch, timeoutMs = 90_000) {
  if (typeof apiKey !== 'string' || !apiKey) throw new PackageError('credential_missing')
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await transport(ENDPOINT, { method:'POST', redirect:'error', cache:'no-store',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
      body:plan.body, signal:abort.signal })
    if (response.status !== 200) return { http_status:response.status, body:null }
    return { http_status:200, body:await readBounded(response) }
  } catch (error) {
    if (error instanceof PackageError) throw error
    throw new PackageError(abort.signal.aborted ? 'timeout' : 'network_error')
  } finally { clearTimeout(timer) }
}
