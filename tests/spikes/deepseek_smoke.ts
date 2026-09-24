/** Offline by default. --live is reserved for a later explicit, configured single request. */
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRequest, callDeepSeek, ENDPOINT, MODEL, PRICE_CHECK_DATE,
  validateResponse } from './deepseek_client.ts'

type Writer = (line: string) => void
const evidenceDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../reports/evidence/BATCH-009-DEEPSEEK')
const attemptPath = resolve(evidenceDir, 'live-attempt.json')
const synthetic = JSON.stringify({ object: 'chat.completion', model: MODEL,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
    content: JSON.stringify({ rows: [{ item: 'A', qty: '1', unit_price: null },
      { item: 'B', qty: '2', unit_price: '0' }] }) } }],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })

export async function runCli(args: readonly string[], write: Writer = console.log): Promise<number> {
  const mode = args.length === 0 ? '--plan' : args.length === 1 ? args[0] : null
  if (mode === '--plan') {
    const request = buildRequest()
    write(JSON.stringify({ mode: 'offline_plan', model: MODEL, endpointHost: 'api.deepseek.com',
      messageBytes: request.messageBytes, maxTokens: 512,
      estimatedMaximumUsd: request.estimatedMaximumUsd,
      estimateSourceDate: PRICE_CHECK_DATE, liveStatus: 'not_run',
      livePrerequisites: ['separate user request', 'DEEPSEEK_API_KEY explicitly configured',
        'same-day official price verification', 'single attempt ledger absent'] }))
    return 0
  }
  if (mode === '--offline') {
    write(JSON.stringify({ mode: 'synthetic_offline', result: validateResponse(200, synthetic) }))
    return 0
  }
  if (mode !== '--live') {
    write('Usage: deepseek_smoke.ts [--plan | --offline | --live]')
    return 2
  }
  const request = buildRequest()
  if (new Date().toISOString().slice(0, 10) !== PRICE_CHECK_DATE || request.estimatedMaximumUsd > 0.05) {
    write(JSON.stringify({ mode: 'live', status: 'not_run', reason: 'same_day_price_check_required' }))
    return 2
  }
  // This is the only credential read; no fallback or environment enumeration.
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    write(JSON.stringify({ mode: 'live', status: 'not_run', reason: 'DEEPSEEK_API_KEY_not_configured' }))
    return 2
  }
  await mkdir(evidenceDir, { recursive: true })
  let handle
  try { handle = await open(attemptPath, 'wx') }
  catch {
    write(JSON.stringify({ mode: 'live', status: 'not_run', reason: 'single_attempt_already_recorded' }))
    return 2
  }
  try {
    await handle.writeFile(JSON.stringify({ status: 'initiated', at: new Date().toISOString(),
      model: MODEL, endpointHost: 'api.deepseek.com', estimateUsd: request.estimatedMaximumUsd }) + '\n')
  } finally { await handle.close() }
  const result = await callDeepSeek(apiKey)
  write(JSON.stringify({ mode: 'live', status: result.transport.state === 'ok' ? 'returned' : 'failed_or_unknown',
    result, attemptRecorded: true, endpoint: ENDPOINT }))
  return result.transport.state === 'ok' && result.schema.state === 'valid'
    && result.contentValidation.state === 'passed' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code }, () => {
    console.error('DeepSeek smoke failed without a request result; inspect the single-attempt ledger before any future action.')
    process.exitCode = 1
  })
}
