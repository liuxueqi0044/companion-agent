import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { LocalProcessBridge } from '../../../apps/desktop/bridge/host/bridge.js'

const ROOT = resolve(import.meta.dirname, '../../..')
const FIXTURE = join(ROOT, 'tests/integration/desktop_bridge/fixtures/child.mjs')
const bridges: LocalProcessBridge[] = []

function bridge(mode: string, options: { shortTimeoutMs?: number; workerTimeoutMs?: number;
  maxShortRequests?: number; marker?: string } = {}) {
  const value = new LocalProcessBridge({
    executable: process.execPath, args: [FIXTURE, mode, options.marker ?? ''], cwd: ROOT,
    env: {}, shortTimeoutMs: options.shortTimeoutMs ?? 2000,
    workerTimeoutMs: options.workerTimeoutMs ?? 2000,
    maxShortRequests: options.maxShortRequests ?? 2,
  })
  bridges.push(value)
  return value
}

afterEach(async () => { await Promise.all(bridges.splice(0).map(item => item.dispose())) })

describe('restricted Node process transport', () => {
  it('correlates a strict single response and keeps a business error distinct', async () => {
    const success = await bridge('echo').invoke('profile.read', { root: 'not-an-arg', command: 'no-shell' })
    expect(success.kind).toBe('success')
    if (success.kind === 'success') expect(success.result).toEqual({ echo: { root: 'not-an-arg', command: 'no-shell' } })
    const failure = await bridge('business').invoke('profile.change', { command_id: 'fictional' })
    expect(failure.kind).toBe('business_error')
    if (failure.kind === 'business_error') expect(failure.code).toBe('conflict')
  })

  it.each(['malformed', 'wrong-id', 'invalid-utf8', 'nonzero-ok', 'noise', 'too-large',
    'duplicate', 'nested-duplicate'])(
    'rejects %s without returning fake success', async mode => {
      const read = await bridge(mode).invoke('task.get', { task_id: 'fictional' })
      expect(read.kind).toBe('transport_error')
      const write = await bridge(mode).invoke('task.submit', { requirement_text: 'secret-like fictional text' })
      expect(write.kind).toBe('transport_error')
      if (write.kind === 'transport_error') {
        expect(write.code).toBe('outcome_unknown')
        expect(JSON.stringify(write)).not.toContain('secret-like')
      }
    },
  )

  it('times out without retry and marks an already sent mutation uncertain', async () => {
    const value = bridge('sleep', { shortTimeoutMs: 50 })
    const read = await value.invoke('profile.read', {})
    const write = await value.invoke('task.submit', { command_id: 'fictional' })
    expect(read).toMatchObject({ kind: 'transport_error', code: 'unavailable', cause: 'timeout' })
    expect(write).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown', cause: 'timeout' })
  })

  it('keeps one worker separate from bounded short requests and settles dispose', async () => {
    const value = bridge('by-action', { maxShortRequests: 1, workerTimeoutMs: 10_000 })
    const running = value.invoke('worker.run-next', {})
    const duplicate = await value.invoke('worker.run-next', {})
    expect(duplicate).toMatchObject({ kind: 'transport_error', code: 'unavailable', cause: 'busy' })
    expect((await value.invoke('profile.read', {})).kind).toBe('success')
    await value.dispose()
    expect(await running).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown', cause: 'disposed' })
    expect((await value.invoke('profile.read', {})).kind).toBe('transport_error')
  })

  it('keeps committed-but-lost mutation receipt unknown and does not retry it', async () => {
    const marker = join(mkdtempSync(join(ROOT, 'reports/evidence/BATCH-016-R1/tmp/bridge-test-')), 'commit.marker')
    const value = bridge('commit-no-ack', { marker })
    const reply = await value.invoke('task.submit', { command_id: 'fictional' })
    expect(reply).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown' })
    expect(existsSync(marker) && readFileSync(marker, 'utf8')).toBe('committed')
  })

  it('rejects overlarge requests before spawning', async () => {
    const reply = await bridge('echo').invoke('task.submit', { csv_text: 'x'.repeat(384 * 1024) })
    expect(reply).toMatchObject({ kind: 'transport_error', code: 'protocol_error', cause: 'input_limit' })
  })
})
