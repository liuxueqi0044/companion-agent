import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestPlan, parseResponse, sendOnce, readBounded } from './plan.mjs'
import { authorizeAttempt } from './policy.mjs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const files = { 'view.html':'<main><button>demo</button></main>',
  'view.css':'body { color: black; }', 'view.js':'window.addEventListener("message", () => {})' }
const response = (content = JSON.stringify(files), finish_reason = 'stop') => JSON.stringify({
  id:'fictional-response-id', object:'chat.completion', model:'DeepSeek-V4.1-Flash',
  choices:[{ index:0, finish_reason, message:{ role:'assistant', content } }],
  usage:{ prompt_tokens:100, completion_tokens:200, total_tokens:300 },
})

test('fixed request is bounded, JSON mode and no tool execution', () => {
  const first = requestPlan(1)
  const second = requestPlan(2, files)
  assert.ok(first.messageBytes < 16 * 1024 && second.messageBytes < 16 * 1024)
  assert.ok(first.estimatedMaximumUsd + second.estimatedMaximumUsd < 0.05)
  const body = JSON.parse(first.body)
  assert.equal(body.model, 'deepseek-flash')
  assert.deepEqual(body.thinking, { type:'disabled' })
  assert.deepEqual(body.response_format, { type:'json_object' })
  assert.equal(body.stream, false)
  assert.equal(body.tools, undefined)
})
test('response shape, truncation, JSON and source fields fail closed', () => {
  assert.equal(parseResponse(response(), 1).manifest.source_type, 'model_candidate')
  assert.throws(() => parseResponse(response('{broken'), 1), { code:'content_not_json' })
  assert.throws(() => parseResponse(response(JSON.stringify({ ...files, command:'rm' })), 1),
    { code:'content_fields_invalid' })
  assert.throws(() => parseResponse(response(JSON.stringify(files), 'length'), 1), { code:'finish_not_stop' })
  assert.throws(() => parseResponse('{bad', 1), { code:'response_not_json' })
  assert.throws(() => parseResponse('x'.repeat(129 * 1024), 1), { code:'response_too_large' })
})
test('transport redirects disabled, timeout and response cap; fake key stays out of result', async () => {
  const fakeKey = 'FAKE_TEST_KEY_DO_NOT_USE'
  const plan = requestPlan(1)
  const ok = await sendOnce(fakeKey, plan, async (_url, options) => {
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, 'Bearer ' + fakeKey)
    return new Response(response(), { status:200 })
  })
  assert.equal(ok.http_status, 200)
  assert.ok(!JSON.stringify(ok).includes(fakeKey))
  await assert.rejects(sendOnce(fakeKey, plan, async (_url, options) =>
    new Promise((_resolve, reject) => options.signal.addEventListener('abort',
      () => reject(new Error('aborted')))), 5), { code:'timeout' })
  await assert.rejects(readBounded(new Response('x'.repeat(129 * 1024))), { code:'response_too_large' })
})
test('reservation rejects concurrent/unknown, over-budget and exhausted attempts', () => {
  assert.ok(authorizeAttempt([], 1, 0.01) <= 0.05)
  assert.throws(() => authorizeAttempt([{ state:'reserved', estimated_max_usd:0.01 }], 1, 0.01),
    { code:'first_attempt_unavailable' })
  assert.throws(() => authorizeAttempt([{ state:'sent_unknown', estimated_max_usd:0.01 }], 2, 0.01),
    { code:'first_candidate_required' })
  for (const state of ['reserved', 'failed_pre_send', 'failed', 'sent_unknown', 'unknown']) {
    assert.throws(() => authorizeAttempt([{ state, estimated_max_usd:0.01 }], 2, 0.01),
      { code:'first_candidate_required' })
  }
  assert.throws(() => authorizeAttempt([{ state:'candidate_valid', estimated_max_usd:0.04 }], 2, 0.02),
    { code:'budget_exceeded' })
  assert.throws(() => authorizeAttempt([{ state:'candidate_valid', estimated_max_usd:0.01 },
    { state:'candidate_valid', estimated_max_usd:0.01 }], 2, 0.01), { code:'attempts_exhausted' })
})
test('exclusive CreateNew lock refuses a simultaneous writer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'personal-space-lock-'))
  const name = path.join(dir, 'live.lock')
  const first = await fs.open(name, 'wx')
  try { await assert.rejects(fs.open(name, 'wx'), { code:'EEXIST' }) }
  finally { await first.close() }
})
