import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { sha } from '../core/package.mjs'
import { readRevision } from '../core/store.mjs'
import { requestPlan } from './plan.mjs'
import { createBatch012Session } from './batch012-session.mjs'
import { dispatchBatch012 } from './batch012-worker.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')
const tmpRoot = path.join(repo, 'reports/evidence/BATCH-012/tmp')
const frozenNode = path.join(repo, '.local-tools/node-v24.21.0-win-x64/node.exe')
const files = { 'view.html':'<main>Fictional three things</main>',
  'view.css':'body { color: #222; }', 'view.js':'window.fictionalCandidate = true' }
function response(content = JSON.stringify(files), finish_reason = 'stop', usage = {
  prompt_tokens:100, completion_tokens:200, total_tokens:300 }) {
  return JSON.stringify({ id:'fictional-response-id', object:'chat.completion', model:'DeepSeek-V4.1-Flash',
    choices:[{ index:0, finish_reason, message:{ role:'assistant', content } }], usage })
}
async function setup({ prior = {}, transport, timeout = 90_000 } = {}) {
  await fs.mkdir(tmpRoot, { recursive:true })
  const dir = await fs.mkdtemp(path.join(tmpRoot, 'case-'))
  const previousLedgerPath = path.join(dir, 'previous-ledger.json')
  const previousLockPath = path.join(dir, 'previous.lock')
  const docsPath = path.join(dir, 'docs.json')
  const previous = { schema:1, attempts:[{ attempt:1, state:'failed_pre_send', sent_at_utc:null,
    estimated_max_usd:0.0040374, ...prior }] }
  await fs.writeFile(previousLedgerPath, JSON.stringify(previous))
  await fs.writeFile(previousLockPath, 'synthetic-prior-lock')
  const date = new Date().toISOString().slice(0, 10)
  await fs.writeFile(docsPath, JSON.stringify({ utc_date:date,
    pricing_url:'https://api-docs.deepseek.com/quick_start/pricing/',
    chat_completion_url:'https://api-docs.deepseek.com/api/create-chat-completion/',
    model:'deepseek-flash', endpoint:'https://api.deepseek.com/chat/completions',
    json_object_supported:true, thinking_disabled_supported:true,
    peak_cache_miss_input_usd_per_million:0.30, peak_output_usd_per_million:1.20 }))
  const expectedPreviousLedgerSha256 = sha(await fs.readFile(previousLedgerPath))
  const expectedPreviousLockSha256 = sha(await fs.readFile(previousLockPath))
  const token = randomUUID()
  await fs.writeFile(path.join(dir, 'live.lock'), token)
  const session = createBatch012Session({ evidenceDir:dir, previousLedgerPath, previousLockPath,
    previousLedgerRef:'synthetic-prior-ledger', expectedPreviousLedgerSha256,
    expectedPreviousLockSha256, docsPath,
    transport:transport ?? (async () => new Response(response(), { status:200 })),
    sendTimeoutMs:timeout })
  return { dir, token, session, previousLedgerPath, previousLockPath, docsPath,
    expectedPreviousLedgerSha256, expectedPreviousLockSha256 }
}
const newLedger = x => fs.readFile(path.join(x.dir, 'live-attempts.json'), 'utf8').then(JSON.parse)

test('worker dispatch is fixed phase 1; plan/offline have no transport or credential use', async () => {
  let calls = 0
  const x = await setup({ transport:async () => { calls++; throw Error('network_forbidden') } })
  const plan = await dispatchBatch012([], x.session)
  assert.equal(plan.mode, 'plan')
  assert.equal(plan.global_attempt, 2)
  assert.equal(plan.network_calls, 0)
  assert.equal(plan.credential_reads, 0)
  const offline = await dispatchBatch012(['--offline'], x.session)
  assert.equal(offline.available, true)
  assert.equal(offline.historical_attempts, 1)
  assert.equal(offline.global_next_attempt, 2)
  assert.ok(offline.combined_estimated_max_usd <= 0.05)
  assert.equal(calls, 0)
  await assert.rejects(dispatchBatch012(['--reserve','2'], x.session), { code:'invalid_phase' })
  await assert.rejects(dispatchBatch012(['--execute','2'], x.session), { code:'invalid_phase' })
  await assert.rejects(dispatchBatch012(['--reserve','1','extra'], x.session), { code:'invalid_arguments' })
  assert.equal(await fs.stat(path.join(x.dir, 'live-attempts.json')).then(() => true, () => false), false)
})

test('actual session and core seal one fixed candidate after a single in-memory transport response', async () => {
  let calls = 0
  const x = await setup({ transport:async (url, options) => {
    calls++
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'POST')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'deepseek-flash')
    assert.equal(body.max_tokens, 2500)
    assert.equal(body.stream, false)
    assert.equal(body.tools, undefined)
    return new Response(response(), { status:200 })
  } })
  const reserved = await x.session.reserve(x.token)
  assert.equal(reserved.local_attempt, 1)
  assert.equal(reserved.global_attempt, 2)
  const before = await newLedger(x)
  assert.equal(before.attempts[0].state, 'reserved')
  assert.equal(before.attempts[0].sent_at_utc, null)
  const result = await x.session.execute(x.token, 'SYNTHETIC_KEY_ONLY')
  assert.equal(result.state, 'candidate_valid')
  assert.equal(calls, 1)
  const ledger = await newLedger(x)
  assert.equal(ledger.global_attempts_used, 2)
  assert.equal(ledger.exhausted, true)
  assert.equal(ledger.previous_ledger_sha256, x.expectedPreviousLedgerSha256)
  assert.equal(ledger.attempts[0].state, 'candidate_valid')
  assert.equal(ledger.attempts[0].usage.prompt_tokens, 100)
  assert.equal(ledger.attempts[0].estimated_usage_cost_usd, (100 * 0.30 + 200 * 1.20) / 1_000_000)
  const sealed = await readRevision(path.join(x.dir, 'model-store'), 'model-v1')
  assert.deepEqual(sealed.files, files)
  assert.equal(sealed.manifest.source_type, 'model_candidate')
  assert.equal(sealed.manifest.execution_validation, 'not_run')
  assert.equal(sealed.manifest.build_input_hash, ledger.attempts[0].candidate_hash)
  assert.equal(sealed.manifest.artifact_hash, ledger.attempts[0].artifact_hash)
  await assert.rejects(x.session.reserve(x.token), { code:'attempts_exhausted' })
  await assert.rejects(x.session.execute(x.token, 'SYNTHETIC_KEY_ONLY'), { code:'reservation_required' })
  assert.equal(calls, 1)
})

test('bad, truncated, oversized, HTTP error and timeout responses all consume the only new attempt', async () => {
  const cases = [
    ['bad_json', async () => new Response('{broken', { status:200 }), 'response_not_json', 200],
    ['truncated', async () => new Response(response(JSON.stringify(files), 'length'), { status:200 }), 'finish_not_stop', 200],
    ['oversized', async () => new Response('x'.repeat(129 * 1024), { status:200 }), 'response_too_large', null],
    ['http_error', async () => new Response('denied', { status:402 }), 'http_error', 402],
    ['timeout', async (_url, options) => new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(Error('aborted')))), 'timeout', null],
  ]
  for (const [name, transport, category, status] of cases) {
    let calls = 0
    const x = await setup({ transport:async (...args) => { calls++; return transport(...args) },
      timeout:name === 'timeout' ? 5 : 90_000 })
    await x.session.reserve(x.token)
    const result = await x.session.execute(x.token, 'SYNTHETIC_KEY_ONLY')
    assert.equal(result.state, 'failed', name)
    assert.equal(result.error_category, category, name)
    assert.equal(result.http_status, status, name)
    assert.equal(calls, 1, name)
    const ledger = await newLedger(x)
    assert.ok(ledger.attempts[0].sent_at_utc, name)
    assert.equal(ledger.attempts[0].state, 'failed', name)
    assert.equal(ledger.attempts[0].candidate_hash, null, name)
    await assert.rejects(x.session.reserve(x.token), { code:'attempts_exhausted' }, name)
    assert.equal(await fs.stat(path.join(x.dir, 'model-store')).then(() => true, () => false), false)
  }
})

test('history hash, prior state, old estimated cost and day-specific docs fail before reservation', async () => {
  const badHash = await setup()
  await fs.writeFile(badHash.previousLedgerPath, 'tampered')
  await assert.rejects(badHash.session.reserve(badHash.token), { code:'history_hash_mismatch' })
  const badLock = await setup()
  await fs.writeFile(badLock.previousLockPath, 'tampered')
  await assert.rejects(badLock.session.reserve(badLock.token), { code:'history_hash_mismatch' })
  const badState = await setup({ prior:{ state:'sent_unknown' } })
  await assert.rejects(badState.session.reserve(badState.token), { code:'history_invalid' })
  const missingCost = await setup({ prior:{ estimated_max_usd:null } })
  await assert.rejects(missingCost.session.reserve(missingCost.token), { code:'history_invalid' })
  const overBudget = await setup({ prior:{ estimated_max_usd:0.049 } })
  await assert.rejects(overBudget.session.reserve(overBudget.token), { code:'budget_exceeded' })
  const badDocs = await setup()
  const docs = JSON.parse(await fs.readFile(badDocs.docsPath, 'utf8'))
  docs.peak_output_usd_per_million = 1.21
  await fs.writeFile(badDocs.docsPath, JSON.stringify(docs))
  await assert.rejects(badDocs.session.reserve(badDocs.token), { code:'docs_recheck_required' })
  for (const x of [badHash,badLock,badState,missingCost,overBudget,badDocs])
    assert.equal(await fs.stat(path.join(x.dir, 'live-attempts.json')).then(() => true, () => false), false)
})

test('pre-send failure, reserved, sent-unknown and finished records never allow a new reserve', async () => {
  const pre = await setup()
  await pre.session.reserve(pre.token)
  await assert.rejects(pre.session.reserve(pre.token), { code:'attempts_exhausted' })
  const mark = await pre.session.markPresendFailure(pre.token, 'credential_decode_failed')
  assert.equal(mark.network_requests_sent, 0)
  assert.equal((await newLedger(pre)).attempts[0].sent_at_utc, null)
  await assert.rejects(pre.session.reserve(pre.token), { code:'attempts_exhausted' })
  await assert.rejects(pre.session.execute(pre.token, 'SYNTHETIC_KEY_ONLY'), { code:'reservation_required' })
  const unknown = await setup()
  await unknown.session.reserve(unknown.token)
  const ledger = await newLedger(unknown)
  ledger.attempts[0].state = 'sent_unknown'
  ledger.attempts[0].sent_at_utc = new Date().toISOString()
  await fs.writeFile(path.join(unknown.dir, 'live-attempts.json'), JSON.stringify(ledger))
  await assert.rejects(unknown.session.reserve(unknown.token), { code:'attempts_exhausted' })
  await assert.rejects(unknown.session.execute(unknown.token, 'SYNTHETIC_KEY_ONLY'),
    { code:'reservation_required' })
})

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide:true })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stdout:stdout.trim(), stderr:stderr.trim() }))
  })
}

test('real launcher-core + synthetic DPAPI + actual worker dispatch/session + in-memory transport', async () => {
  assert.equal(await fs.stat(frozenNode).then(() => true, () => false), true)
  const x = await setup()
  const credentialScript = path.join(x.dir, 'make-synthetic-credential.ps1')
  await fs.writeFile(credentialScript, `param([string]$Dir)\n$ErrorActionPreference = 'Stop'\n$key = 'SYNTHETIC_' + [Guid]::NewGuid().ToString('N')\n$secure = ConvertTo-SecureString $key -AsPlainText -Force\n$cipher = ConvertFrom-SecureString $secure\n[IO.File]::WriteAllText([IO.Path]::Combine($Dir,'synthetic.dpapi'),$cipher,[Text.Encoding]::UTF8)\n$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($key))).ToLowerInvariant()\n[IO.File]::WriteAllText([IO.Path]::Combine($Dir,'expected.sha256'),$hash)\n$key = $null\n`)
  const made = await run('pwsh', ['-NoProfile','-File',credentialScript,x.dir])
  assert.equal(made.code, 0)
  assert.equal(made.stdout, '')
  const config = { expectedPreviousLedgerSha256:x.expectedPreviousLedgerSha256,
    expectedPreviousLockSha256:x.expectedPreviousLockSha256 }
  await fs.writeFile(path.join(x.dir, 'runner-config.json'), JSON.stringify(config))
  const sessionUri = pathToFileURL(path.join(here, 'batch012-session.mjs')).href
  const workerUri = pathToFileURL(path.join(here, 'batch012-worker.mjs')).href
  const runner = path.join(x.dir, 'memory-worker.mjs')
  await fs.writeFile(runner, `import fs from 'node:fs/promises'\nimport path from 'node:path'\nimport { fileURLToPath } from 'node:url'\nimport { createHash } from 'node:crypto'\nimport { createBatch012Session } from ${JSON.stringify(sessionUri)}\nimport { dispatchBatch012 } from ${JSON.stringify(workerUri)}\nconst dir = path.dirname(fileURLToPath(import.meta.url))\nconst config = JSON.parse(await fs.readFile(path.join(dir,'runner-config.json'),'utf8'))\nconst mode = process.argv[2]\nconst allowed = new Set(['SystemRoot','TEMP','TMP','PERSONAL_SPACE_ATTEMPT_TOKEN','PERSONAL_SPACE_DEEPSEEK_KEY','PERSONAL_SPACE_PRESEND_ERROR_CATEGORY'])\nconst minimal = Object.keys(process.env).every(name => allowed.has(name))\nconst key = process.env.PERSONAL_SPACE_DEEPSEEK_KEY\nconst present = !!key\nawait fs.appendFile(path.join(dir,'worker-events.jsonl'),JSON.stringify({mode,minimal,key_present:present})+'\\n')\ntry {\n  if (!minimal) throw Error('environment_not_minimal')\n  if (mode === '--execute') {\n    const expected = (await fs.readFile(path.join(dir,'expected.sha256'),'utf8')).trim()\n    if (createHash('sha256').update(key ?? '').digest('hex') !== expected) throw Error('key_mismatch')\n  } else if (present) throw Error('key_on_nonexecute')\n  const session = createBatch012Session({ evidenceDir:dir, previousLedgerPath:path.join(dir,'previous-ledger.json'),\n    previousLockPath:path.join(dir,'previous.lock'), previousLedgerRef:'synthetic-prior-ledger',\n    expectedPreviousLedgerSha256:config.expectedPreviousLedgerSha256,\n    expectedPreviousLockSha256:config.expectedPreviousLockSha256, docsPath:path.join(dir,'docs.json'),\n    transport:async () => { await new Promise(resolve => setTimeout(resolve,150));\n      return new Response(${JSON.stringify(response())},{status:200}) } })\n  const value = await dispatchBatch012(process.argv.slice(2),session)\n  process.stdout.write(JSON.stringify({ok:true,...value})+'\\n')\n} catch(error) { process.stdout.write(JSON.stringify({ok:false,code:/^[a-z_]+$/.test(error.code ?? error.message) ? (error.code ?? error.message) : 'fake_failure'})+'\\n'); process.exitCode=1 }\n`)
  const launcher = path.join(x.dir, 'synthetic-launcher.ps1')
  await fs.writeFile(launcher, `param([string]$Core,[string]$Dir,[string]$Credential,[string]$Node,[string]$Worker)\n$ErrorActionPreference='Stop'\n. $Core\nInvoke-CompanionLiveAttempt 1 $Dir $Credential $Node $Worker | ConvertTo-Json -Compress\n`)
  const args = ['-NoProfile','-File',launcher,path.join(here, 'launcher-core.ps1'),x.dir,
    path.join(x.dir, 'synthetic.dpapi'),frozenNode,runner]
  // The helper's initial synthetic lock is removed; the real launcher creates its own.
  await fs.unlink(path.join(x.dir, 'live.lock'))
  const [a,b] = await Promise.all([run('pwsh', args), run('pwsh', args)])
  assert.equal(a.code, 0)
  assert.equal(b.code, 0)
  const outcomes = [JSON.parse(a.stdout), JSON.parse(b.stdout)]
  assert.equal(outcomes.filter(value => value.ok && value.state === 'candidate_valid').length, 1)
  assert.equal(outcomes.filter(value => !value.ok
    && ['lock_exists','attempts_exhausted'].includes(value.code)).length, 1)
  const ledger = await newLedger(x)
  assert.equal(ledger.attempts.length, 1)
  assert.equal(ledger.attempts[0].global_attempt, 2)
  assert.equal(ledger.attempts[0].state, 'candidate_valid')
  const sealed = await readRevision(path.join(x.dir, 'model-store'), 'model-v1')
  assert.deepEqual(sealed.files, files)
  assert.equal(sealed.manifest.execution_validation, 'not_run')
  const events = (await fs.readFile(path.join(x.dir, 'worker-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse)
  assert.ok(events.every(event => event.minimal))
  assert.equal(events.filter(event => event.mode === '--execute' && event.key_present).length, 1)
  assert.ok(events.filter(event => event.mode === '--reserve').every(event => !event.key_present))
  assert.equal(await fs.stat(path.join(x.dir, 'live.lock')).then(() => true, () => false), false)
  // A new launcher cannot spend a third global attempt even after success removed the lock.
  const again = await run('pwsh', args)
  assert.equal(JSON.parse(again.stdout).code, 'attempts_exhausted')
  assert.equal((await newLedger(x)).attempts.length, 1)
})
