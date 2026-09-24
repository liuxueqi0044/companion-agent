import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LocalProcessBridge } from '../../../apps/desktop/bridge/host/bridge.js'

const ROOT = resolve(import.meta.dirname, '../../..')
const CHILD = join(ROOT, 'tests/integration/desktop_bridge/fixtures/child.mjs')

class TimedChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 999_999 // Process existence is not inferred from kill's return value.
  killCalls = 0
  killResult = true

  kill(): boolean { this.killCalls += 1; return this.killResult }
  close(code: number | null = 1): void {
    this.emit('close', code)
    this.stdin.destroy()
    this.stdout.destroy()
    this.stderr.destroy()
  }
}

function fakeBridge(children: TimedChild[], options: { disposeTimeoutMs?: number;
  shortTimeoutMs?: number; maxShortRequests?: number } = {}) {
  let next = 0
  return new LocalProcessBridge({ executable: 'controlled-child', args: ['fixed'], cwd: ROOT, env: {},
    disposeTimeoutMs: options.disposeTimeoutMs ?? 80,
    shortTimeoutMs: options.shortTimeoutMs ?? 1000,
    maxShortRequests: options.maxShortRequests ?? 1,
    spawnChild: (() => children[next++] as unknown as ChildProcessWithoutNullStreams) as unknown as typeof spawn })
}

describe('process ownership lasts through actual close', () => {
  it('keeps an EPIPE child owned across an uncertain receipt and bounded dispose', async () => {
    const child = new TimedChild()
    const bridge = fakeBridge([child], { disposeTimeoutMs: 35 })
    const running = bridge.invoke('task.submit', { command_id: 'fictional' })
    child.stdin.emit('error', new Error('EPIPE'))
    expect(await running).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown', cause: 'pipe_error' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, shortRequests: 1 })
    const first = bridge.dispose()
    const again = bridge.dispose()
    expect(again).toBe(first)
    expect(await first).toEqual({ closed: false, activeProcesses: 1 })
    expect(child.killCalls).toBeGreaterThanOrEqual(2)
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, shortRequests: 1, disposed: true })
    child.close()
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, shortRequests: 0 })
  })

  it('waits for delayed close even when kill returns false', async () => {
    const child = new TimedChild()
    child.killResult = false
    const bridge = fakeBridge([child], { disposeTimeoutMs: 200 })
    const pending = bridge.invoke('worker.run-next', {})
    const finishing = bridge.dispose()
    await Promise.resolve() // dispose has requested termination, not proven exit.
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, workerActive: true })
    setTimeout(() => child.close(), 20)
    expect(await finishing).toEqual({ closed: true, activeProcesses: 0 })
    expect(await pending).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown', cause: 'disposed' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, workerActive: false })
  })

  it('retains capacity until close after timeout and does not reuse a failed child slot', async () => {
    const old = new TimedChild()
    const replacement = new TimedChild()
    const bridge = fakeBridge([old, replacement], { shortTimeoutMs: 15 })
    expect(await bridge.invoke('task.submit', {})).toMatchObject({ kind: 'transport_error',
      code: 'outcome_unknown', cause: 'timeout' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, shortRequests: 1 })
    expect(await bridge.invoke('profile.read', {})).toMatchObject({ kind: 'transport_error',
      code: 'unavailable', cause: 'busy' })
    old.close()
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, shortRequests: 0 })
    const next = bridge.invoke('profile.read', {})
    old.close() // A stale close must not release the replacement's slot.
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, shortRequests: 1 })
    replacement.close()
    expect(await next).toMatchObject({ kind: 'transport_error', code: 'protocol_error' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, shortRequests: 0 })
    expect(await bridge.dispose()).toEqual({ closed: true, activeProcesses: 0 })
  })

  it('stops collecting repeated over-limit data while retaining the child until close', async () => {
    const child = new TimedChild()
    const bridge = fakeBridge([child])
    const running = bridge.invoke('task.submit', {})
    child.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1))
    expect(await running).toMatchObject({ kind: 'transport_error',
      code: 'outcome_unknown', cause: 'stdout_limit' })
    child.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1))
    expect(child.killCalls).toBe(1)
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 1, shortRequests: 1 })
    child.close()
    expect((await bridge.dispose()).closed).toBe(true)
  })

  it('releases a slot immediately when spawn throws before returning a process', async () => {
    const bridge = new LocalProcessBridge({ executable: 'controlled-child', args: ['fixed'],
      cwd: ROOT, env: {}, spawnChild: (() => { throw new Error('spawn failed') }) as typeof spawn })
    expect(await bridge.invoke('task.submit', {})).toMatchObject({ kind: 'transport_error',
      code: 'unavailable', cause: 'spawn_error' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, shortRequests: 0 })
    expect(await bridge.dispose()).toEqual({ closed: true, activeProcesses: 0 })
  })

  it('classifies an asynchronous executable spawn failure as unavailable and observes close', async () => {
    const bridge = new LocalProcessBridge({
      executable: join(ROOT, 'reports/evidence/BATCH-016-R1/tmp/no-such-python.exe'),
      args: ['fixed'], cwd: ROOT, env: {}, shortTimeoutMs: 1000,
    })
    expect(await bridge.invoke('task.submit', {})).toMatchObject({ kind: 'transport_error',
      code: 'unavailable', cause: 'spawn_error' })
    expect(await bridge.dispose()).toEqual({ closed: true, activeProcesses: 0 })
  })

  it('observes actual close of one self-started local child during dispose', async () => {
    const bridge = new LocalProcessBridge({ executable: process.execPath,
      args: [CHILD, 'sleep', ''], cwd: ROOT, env: {}, workerTimeoutMs: 10_000 })
    const pending = bridge.invoke('worker.run-next', {})
    const result = await bridge.dispose()
    expect(result).toEqual({ closed: true, activeProcesses: 0 })
    expect(await pending).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown', cause: 'disposed' })
    expect(bridge.diagnostics()).toMatchObject({ activeProcesses: 0, workerActive: false })
  })
})
