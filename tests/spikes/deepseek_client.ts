/** Narrow, optional DeepSeek REST smoke. No request is made on import. */
export const ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const MODEL = 'deepseek-flash'
export const PRICE_CHECK_DATE = '2026-09-23'
export const PEAK_INPUT_MISS_USD_PER_M = 0.3
export const PEAK_OUTPUT_USD_PER_M = 1.2
export const MAX_TOKENS = 512
const MAX_MESSAGES_BYTES = 2048
const MAX_RESPONSE_BYTES = 64 * 1024

type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
export type FictionalRow = { item: 'A' | 'B'; qty: '1' | '2'; unit_price: null | '0' }
export type ValidatedOutput = { rows: [FictionalRow, FictionalRow] }
export type SmokeResult = {
  model: typeof MODEL
  endpointHost: 'api.deepseek.com'
  transport: { state: 'ok' | 'http_error' | 'timeout' | 'network_error'; httpStatus: number | null }
  schema: { state: 'valid' | 'invalid' | 'not_checked'; issue: string | null }
  contentValidation: { state: 'passed' | 'failed' | 'not_checked'; issue: string | null }
  finishReason: string | null
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null }
  validatedOutput: ValidatedOutput | null
  costAmountUsd: null
}

const system = 'Return JSON only. Exact shape: {"rows":[{"item":"A","qty":"1","unit_price":null},{"item":"B","qty":"2","unit_price":"0"}]}. Keep missing price null and explicit zero as string "0".'
const user = 'Convert these fictional CSV rows to JSON: A has qty 1 and missing unit_price; B has qty 2 and unit_price 0.'

export function buildRequest(): { body: string; messageBytes: number; estimatedMaximumUsd: number } {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]
  const messageBytes = new TextEncoder().encode(JSON.stringify(messages)).byteLength
  if (messageBytes > MAX_MESSAGES_BYTES) throw new Error('fixed_messages_too_large')
  const estimatedInputTokens = messageBytes * 2 // Conservative estimate, not a provider billing cap.
  const estimatedMaximumUsd = (estimatedInputTokens * PEAK_INPUT_MISS_USD_PER_M
    + MAX_TOKENS * PEAK_OUTPUT_USD_PER_M) / 1_000_000
  const body = JSON.stringify({ model: MODEL, messages, thinking: { type: 'disabled' },
    response_format: { type: 'json_object' }, stream: false, max_tokens: MAX_TOKENS })
  if (new TextEncoder().encode(body).byteLength > 4096) throw new Error('fixed_request_too_large')
  return { body, messageBytes, estimatedMaximumUsd }
}

function blank(): SmokeResult {
  return { model: MODEL, endpointHost: 'api.deepseek.com',
    transport: { state: 'ok', httpStatus: null }, schema: { state: 'not_checked', issue: null },
    contentValidation: { state: 'not_checked', issue: null }, finishReason: null,
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    validatedOutput: null, costAmountUsd: null }
}

export function validateResponse(httpStatus: number, raw: string): SmokeResult {
  const out = blank()
  out.transport.httpStatus = httpStatus
  if (httpStatus !== 200) { out.transport.state = 'http_error'; return out }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    out.schema = { state: 'invalid', issue: 'response_too_large' }; return out
  }
  let value: unknown
  try { value = JSON.parse(raw) as unknown }
  catch { out.schema = { state: 'invalid', issue: 'response_not_json' }; return out }
  if (!object(value) || value.object !== 'chat.completion' || value.model !== MODEL || !Array.isArray(value.choices)
      || value.choices.length !== 1 || !object(value.choices[0])
      || value.choices[0].index !== 0 || !object(value.choices[0].message)
      || value.choices[0].message.role !== 'assistant' || typeof value.choices[0].finish_reason !== 'string'
      || typeof value.choices[0].message.content !== 'string') {
    out.schema = { state: 'invalid', issue: 'response_shape_invalid' }; return out
  }
  out.schema = { state: 'valid', issue: null }
  out.finishReason = value.choices[0].finish_reason
  if (object(value.usage)) {
    out.usage = { promptTokens: count(value.usage.prompt_tokens),
      completionTokens: count(value.usage.completion_tokens), totalTokens: count(value.usage.total_tokens) }
  }
  if (out.finishReason !== 'stop') {
    out.contentValidation = { state: 'failed', issue: 'finish_reason_not_stop' }; return out
  }
  const content = value.choices[0].message.content
  if (!content.trim()) { out.contentValidation = { state: 'failed', issue: 'empty_content' }; return out }
  let parsed: unknown
  try { parsed = JSON.parse(content) as unknown }
  catch { out.contentValidation = { state: 'failed', issue: 'content_not_json' }; return out }
  if (!object(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.rows)
      || parsed.rows.length !== 2 || !parsed.rows.every((row: unknown) => object(row)
        && Object.keys(row).sort().join(',') === 'item,qty,unit_price')
      || !object(parsed.rows[0]) || !object(parsed.rows[1])
      || parsed.rows[0].item !== 'A' || parsed.rows[0].qty !== '1' || parsed.rows[0].unit_price !== null
      || parsed.rows[1].item !== 'B' || parsed.rows[1].qty !== '2' || parsed.rows[1].unit_price !== '0') {
    out.contentValidation = { state: 'failed', issue: 'content_values_invalid' }; return out
  }
  out.contentValidation = { state: 'passed', issue: null }
  out.validatedOutput = { rows: [
    { item: 'A', qty: '1', unit_price: null },
    { item: 'B', qty: '2', unit_price: '0' },
  ] }
  return out
}

async function readBounded(response: Response): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  let total = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); return null }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  catch { return null }
}

export async function callDeepSeek(apiKey: string, transport: typeof fetch = fetch,
  todayUtc: () => string = () => new Date().toISOString().slice(0, 10)): Promise<SmokeResult> {
  const request = buildRequest()
  if (request.estimatedMaximumUsd > 0.05 || todayUtc() !== PRICE_CHECK_DATE)
    throw new Error('price_check_required')
  if (!apiKey) throw new Error('key_missing')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await transport(ENDPOINT, { method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: request.body, signal: controller.signal })
    if (response.status !== 200) return validateResponse(response.status, '')
    const body = await readBounded(response)
    if (body === null) {
      const out = blank(); out.transport.httpStatus = response.status
      out.schema = { state: 'invalid', issue: 'response_too_large_or_invalid_utf8' }; return out
    }
    return validateResponse(response.status, body)
  } catch (error) {
    const out = blank()
    out.transport.state = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
      ? 'timeout' : 'network_error'
    return out
  } finally { clearTimeout(timer) }
}
