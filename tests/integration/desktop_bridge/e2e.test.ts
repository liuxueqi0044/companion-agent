import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { createDevelopmentBridge, LocalProcessBridge } from '../../../apps/desktop/bridge/host/bridge.js'
import { LocalTaskController } from '../../../apps/desktop/bridge/client/controller.js'
import type { Action, Payload } from '../../../apps/desktop/bridge/protocol.js'

const ROOT = resolve(import.meta.dirname, '../../..')
const PYTHON = join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const FIXTURE = join(ROOT, 'tests/integration/desktop_bridge/fixtures/python_entry.py')
const opened: LocalProcessBridge[] = []

function location() {
  const parent = mkdtempSync(join(ROOT, 'reports/evidence/BATCH-016-R1/tmp/e2e-'))
  return { root: join(parent, 'state'), ready: join(parent, 'ready'), release: join(parent, 'release') }
}

function bridge(paths: ReturnType<typeof location>, mode = 'normal') {
  const env: Record<string, string> = { PYTHONNOUSERSITE: '1', PYTHONUTF8: '1' }
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  const value = new LocalProcessBridge({ executable: PYTHON,
    args: ['-I', FIXTURE, paths.root, mode, paths.ready, paths.release], cwd: ROOT, env,
    shortTimeoutMs: 5000, workerTimeoutMs: 12_000, maxShortRequests: 3 })
  opened.push(value)
  return value
}

async function ok(value: LocalProcessBridge, action: Action, payload: Payload = {}): Promise<any> {
  const reply = await value.invoke(action, payload)
  expect(reply.kind, JSON.stringify(reply)).toBe('success')
  if (reply.kind !== 'success') throw new Error('expected_success')
  return reply.result
}

async function waitFile(path: string) {
  const end = Date.now() + 5000
  while (!existsSync(path) && Date.now() < end) await pause(10)
  expect(existsSync(path)).toBe(true)
}

afterEach(async () => { await Promise.all(opened.splice(0).map(value => value.dispose())) })

describe('actual Node → isolated Python → SQLite → Decimal CSV', () => {
  it('keeps read and cancellation responsive during a gated real worker', async () => {
    const paths = location()
    const host = bridge(paths, 'gate')
    const profile = await ok(host, 'bootstrap')
    const task = (await ok(host, 'task.submit', { command_id: randomUUID(),
      requirement_text: '核对虚构文具',
      csv_text: 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n' })).task
    const running = host.invoke('worker.run-next', {})
    await waitFile(paths.ready)
    const started = Date.now()
    expect((await ok(host, 'task.get', { task_id: task.task_id })).status).toBe('running')
    expect((await ok(host, 'task.cancel', { task_id: task.task_id, command_id: randomUUID() })).task.status)
      .toBe('cancelling')
    expect((await ok(host, 'profile.read')).profile_id).toBe(profile.profile_id)
    expect(Date.now() - started).toBeLessThan(4500)
    writeFileSync(paths.release, 'go')
    const workerReply = await running
    expect(workerReply.kind).toBe('success')
    if (workerReply.kind === 'success') expect((workerReply.result as any).status).toBe('cancelled')
    expect((await ok(host, 'task.get', { task_id: task.task_id })).status).toBe('cancelled')
    const missing = await host.invoke('task.result', { task_id: task.task_id })
    expect(missing).toMatchObject({ kind: 'business_error', code: 'not_ready' })
    await host.dispose()
    const reopened = bridge(paths)
    expect((await ok(reopened, 'profile.read')).profile_id).toBe(profile.profile_id)
    expect((await ok(reopened, 'task.get', { task_id: task.task_id })).status).toBe('cancelled')
  })

  it('keeps a crashed worker running until explicit recover and new attempt retry', async () => {
    const paths = location()
    const broken = bridge(paths, 'crash')
    await ok(broken, 'bootstrap')
    const task = (await ok(broken, 'task.submit', { command_id: randomUUID(),
      requirement_text: '虚构报价', csv_text: 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n' })).task
    const lost = await broken.invoke('worker.run-next', {})
    expect(lost).toMatchObject({ kind: 'transport_error', code: 'outcome_unknown' })
    expect((await ok(broken, 'task.get', { task_id: task.task_id })).status).toBe('running')
    await broken.dispose()
    const normal = bridge(paths)
    const recovered = await ok(normal, 'worker.recover')
    expect(recovered).toHaveLength(1)
    expect(recovered[0].status).toBe('interrupted')
    const retry = (await ok(normal, 'task.retry', { task_id: task.task_id, command_id: randomUUID() })).task
    expect(retry.attempt_count).toBe(2)
    expect(retry.current_attempt_id).not.toBe(task.current_attempt_id)
    expect((await ok(normal, 'worker.run-next')).status).toBe('completed')
    expect((await ok(normal, 'task.result', { task_id: task.task_id })).metadata.total).toBe('6')
  })

  it('reads committed submit and completed result after their receipts are lost', async () => {
    const paths = location()
    const lostSubmit = bridge(paths, 'ack_loss')
    await ok(lostSubmit, 'bootstrap')
    const commandId = randomUUID()
    const payload = { command_id: commandId, requirement_text: '虚构金额',
      csv_text: 'item,unit,qty,unit_price,currency\n纸,张,0.1,0.2,CNY\n笔,支,3,0.1,CNY\n' }
    expect(await lostSubmit.invoke('task.submit', payload)).toMatchObject({
      kind: 'transport_error', code: 'outcome_unknown',
    })
    await waitFile(paths.ready)
    await lostSubmit.dispose()
    const normal = bridge(paths)
    const replay = await ok(normal, 'task.submit', payload) // Caller explicitly reuses the original UUID.
    expect(replay.replayed).toBe(true)
    const task = replay.task
    const lostWorker = bridge(paths, 'worker_ack_loss')
    expect(await lostWorker.invoke('worker.run-next', {})).toMatchObject({
      kind: 'transport_error', code: 'outcome_unknown',
    })
    expect((await ok(normal, 'task.get', { task_id: task.task_id })).status).toBe('completed')
    const result = await ok(normal, 'task.result', { task_id: task.task_id, limit: 1 })
    expect(result.metadata.total).toBe('0.32')
    expect(result.rows[0].subtotal).toBe('0.02')
    expect(result.next_offset).toBe(1)
    const second = await ok(normal, 'task.result', { task_id: task.task_id, offset: result.next_offset })
    expect(second.rows[0].subtotal).toBe('0.3')
    expect(second.rows[0].source_refs.qty).toContain('csv:record:2:column:qty')
  })

  it('runs the full fictional identity, source, issue, undo and restart chain', async () => {
    const paths = location()
    const first = bridge(paths)
    const profile = await ok(first, 'bootstrap')
    const change = await ok(first, 'profile.change', { expected_revision: 1,
      command_id: randomUUID(), changes: { ai_name: 'Mira', address_user_as: 'Alex' } })
    const csv = 'item,unit,qty,unit_price,currency\r\n"蓝色\n笔",支,2,3.50,CNY\r\n'
    const task = (await ok(first, 'task.submit', { command_id: randomUUID(),
      requirement_text: '请保留来源，虚构文具。', csv_text: csv })).task
    expect(task.profile_revision).toBe(change.result_revision)
    expect((await ok(first, 'worker.run-next')).status).toBe('completed')
    const page = await ok(first, 'task.result', { task_id: task.task_id })
    expect(page.metadata.total).toBe('7.00')
    expect(page.rows[0].source_refs.qty).toContain('physical-lines:2-3')
    expect(page.rows[0].cells.item).toBe('蓝色\n笔')
    const events = await ok(first, 'task.events', { task_id: task.task_id, after_seq: 1 })
    expect(events.items.map((event: any) => event.kind)).toEqual(['started', 'completed'])
    const issue = (await ok(first, 'task.submit', { command_id: randomUUID(),
      requirement_text: '缺列待确认', csv_text: 'item,unit,qty,currency\n笔,支,2,CNY\n' })).task
    expect((await ok(first, 'worker.run-next')).status).toBe('completed')
    const issuePage = await ok(first, 'task.result', { task_id: issue.task_id })
    expect(issuePage.metadata.total).toBeNull()
    expect(issuePage.issues[0]).toMatchObject({ code: 'missing_column', column: 'unit_price' })
    const queued = (await ok(first, 'task.submit', { command_id: randomUUID(),
      requirement_text: '排队取消', csv_text: csv })).task
    expect((await ok(first, 'task.cancel', { task_id: queued.task_id, command_id: randomUUID() })).task.status)
      .toBe('cancelled')
    const undone = await ok(first, 'profile.undo', { expected_revision: change.result_revision,
      target_revision: 1, command_id: randomUUID() })
    expect(undone.result_revision).toBe(3)
    await first.dispose()
    const reopened = bridge(paths)
    expect((await ok(reopened, 'profile.read')).profile_id).toBe(profile.profile_id)
    expect((await ok(reopened, 'task.get', { task_id: task.task_id })).profile_revision).toBe(2)
    expect((await ok(reopened, 'task.result', { task_id: task.task_id })).metadata.total).toBe('7.00')
  })

  it('production factory rejects a page-selected root before opening the frozen runtime DB', async () => {
    const value = createDevelopmentBridge(ROOT)
    opened.push(value)
    const reply = await value.invoke('profile.read', { root: 'page-override' })
    expect(reply).toMatchObject({ kind: 'business_error', code: 'invalid_request' })
  })

  it('drives the actual backend through the headless client and disposes cleanly', async () => {
    const paths = location()
    const host = bridge(paths)
    const client = new LocalTaskController(host, { pollMs: 100 })
    const states: string[] = []
    const unsubscribe = client.subscribe(state => states.push(state.connection))
    expect((await client.bootstrap()).kind).toBe('success')
    const profile = client.state.profile as any
    expect((await client.changeProfile({ expected_revision: profile.revision,
      command_id: randomUUID(), changes: { ai_name: 'Mira', address_user_as: 'Alex' } })).kind)
      .toBe('success')
    const submission = await client.submitTask({ command_id: randomUUID(),
      requirement_text: '虚构文具保留来源',
      csv_text: 'item,unit,qty,unit_price,currency\n笔,支,2,3.50,CNY\n' })
    expect(submission.kind).toBe('success')
    const task = client.state.task as any
    await client.watchTask(task.task_id)
    expect(client.state.watching).toBe(true)
    expect((await client.runNext()).kind).toBe('success')
    expect((client.state.task as any).status).toBe('completed')
    expect(client.state.watching).toBe(false)
    expect((await client.loadResultPage({ limit: 1 })).kind).toBe('success')
    const result = client.state.resultPage as any
    expect(result.metadata.total).toBe('7.00')
    expect(result.rows[0].source_refs.qty).toContain('csv:record:1:column:qty')
    unsubscribe()
    client.dispose()
    await host.dispose()
    expect(client.state.connection).toBe('disconnected')
    expect(host.diagnostics()).toEqual({ activeProcesses: 0, shortRequests: 0,
      workerActive: false, disposed: true })
    expect(states).toContain('ready')
  })
})
