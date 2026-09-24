import { describe, expect, it } from 'vitest'
import { LocalTaskController } from '../../../apps/desktop/bridge/client/controller.js'
import type { Action, BridgePort, BridgeReply, Payload } from '../../../apps/desktop/bridge/protocol.js'

const id = '11111111-1111-4111-8111-111111111111'
const success = (result: any): BridgeReply => ({ kind: 'success', requestId: id, result })
const business = (code: string): BridgeReply => ({ kind: 'business_error', requestId: id, code })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function port(fn: (action: Action, payload: Payload) => Promise<BridgeReply> | BridgeReply): BridgePort {
  return { invoke: (action, payload) => Promise.resolve(fn(action, payload)) }
}
const task = (taskId: string, status: string, lastSeq: number) =>
  ({ task_id: taskId, status, last_seq: lastSeq, current_attempt_id: 'attempt' })

describe('headless client controller', () => {
  it('subscribes, preserves confirmed profile on CAS conflict and never auto-retries', async () => {
    const calls: Action[] = []
    const controller = new LocalTaskController(port((action) => {
      calls.push(action)
      if (action === 'profile.read') return success({ profile_id: 'p', revision: 2 })
      return business('conflict')
    }))
    const states: string[] = []
    const off = controller.subscribe(state => states.push(state.connection))
    expect(controller.state.connection).toBe('disconnected')
    await controller.connect()
    expect(controller.state.profile).toEqual({ profile_id: 'p', revision: 2 })
    const conflict = await controller.changeProfile({ expected_revision: 1, command_id: id,
      changes: { ai_name: 'Mira' } })
    expect(conflict).toMatchObject({ kind: 'business_error', code: 'conflict' })
    expect(controller.state.profile).toEqual({ profile_id: 'p', revision: 2 })
    expect(controller.state.stale).toBe(true)
    expect(calls).toEqual(['profile.read', 'profile.change'])
    off()
    controller.dispose()
    expect(states).toContain('ready')
  })

  it('drops older task and result responses after switch or newer page', async () => {
    const first = deferred<BridgeReply>()
    const second = deferred<BridgeReply>()
    const pages = [deferred<BridgeReply>(), deferred<BridgeReply>()]
    let gets = 0
    let results = 0
    const controller = new LocalTaskController(port((action) => {
      if (action === 'task.get') return ++gets === 1 ? first.promise : second.promise
      if (action === 'task.result') return pages[results++].promise
      return success(null)
    }))
    const old = controller.watchTask('old')
    const current = controller.watchTask('current')
    second.resolve(success(task('current', 'completed', 3)))
    await current
    first.resolve(success(task('old', 'completed', 8)))
    await old
    expect((controller.state.task as any).task_id).toBe('current')
    const oldPage = controller.loadResultPage({ offset: 0 })
    const newPage = controller.loadResultPage({ offset: 1 })
    pages[1].resolve(success({ rows: [{ subtotal: '2' }], next_offset: null }))
    await newPage
    pages[0].resolve(success({ rows: [{ subtotal: '1' }], next_offset: 1 }))
    await oldPage
    expect((controller.state.resultPage as any).rows[0].subtotal).toBe('2')
    controller.dispose()
  })

  it('starts from snapshot seq, deduplicates events, refreshes terminal status and stops', async () => {
    let reads = 0
    const cursors: number[] = []
    const controller = new LocalTaskController(port((action, payload) => {
      if (action === 'task.get') return success(++reads === 1 ? task('t', 'running', 1)
        : task('t', 'completed', 3))
      if (action === 'task.events') {
        cursors.push(payload.after_seq as number)
        return success({ task_id: 't', last_seq: 3, next_after_seq: null,
          items: [{ seq: 1, kind: 'submitted' }, { seq: 2, kind: 'started' },
            { seq: 3, kind: 'completed' }] })
      }
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    const deadline = Date.now() + 1500
    while (controller.state.watching && Date.now() < deadline)
      await new Promise(done => setTimeout(done, 10))
    expect(controller.state.watching).toBe(false)
    expect((controller.state.task as any).status).toBe('completed')
    expect(controller.state.taskEvents.map((event: any) => event.seq)).toEqual([2, 3])
    expect(cursors).toEqual([1])
    controller.dispose()
  })

  it('keeps confirmed result on unknown worker outcome and ignores after dispose', async () => {
    const pending = deferred<BridgeReply>()
    const controller = new LocalTaskController(port((action) => {
      if (action === 'task.get') return success(task('t', 'completed', 3))
      if (action === 'task.result') return success({ rows: [{ subtotal: '7.00' }], metadata: { total: '7.00' } })
      if (action === 'worker.run-next') return {
        kind: 'transport_error', requestId: id, code: 'outcome_unknown', cause: 'timeout',
      }
      if (action === 'profile.read') return pending.promise
      return success(null)
    }))
    await controller.watchTask('t')
    await controller.loadResultPage({ offset: 0 })
    await controller.runNext()
    expect(controller.state.stale).toBe(true)
    expect((controller.state.task as any).status).toBe('completed')
    expect((controller.state.resultPage as any).metadata.total).toBe('7.00')
    const read = controller.connect()
    controller.dispose()
    pending.resolve(success({ profile_id: 'late' }))
    await read
    expect(controller.state.connection).toBe('disconnected')
    expect(controller.state.profile).toBeNull()
  })

  it('stops an in-flight watch without accepting its later event page', async () => {
    const pending = deferred<BridgeReply>()
    const controller = new LocalTaskController(port((action) => {
      if (action === 'task.get') return success(task('t', 'running', 1))
      if (action === 'task.events') return pending.promise
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    await new Promise(done => setTimeout(done, 120))
    controller.stopWatch()
    pending.resolve(success({ task_id: 't', last_seq: 2, next_after_seq: null,
      items: [{ seq: 2, kind: 'completed' }] }))
    await new Promise(done => setTimeout(done, 20))
    expect(controller.state.watching).toBe(false)
    expect(controller.state.taskEvents).toEqual([])
    controller.dispose()
  })

  it('starts the replacement watch while an old event request is still pending', async () => {
    const oldEvents = deferred<BridgeReply>()
    let newReads = 0
    const controller = new LocalTaskController(port((action, payload) => {
      if (action === 'task.get') {
        if (payload.task_id === 'old') return success(task('old', 'running', 1))
        return success(++newReads === 1 ? task('new', 'running', 1) : task('new', 'completed', 2))
      }
      if (action === 'task.events') return payload.task_id === 'old' ? oldEvents.promise
        : success({ task_id: 'new', last_seq: 2, next_after_seq: null,
          items: [{ seq: 2, kind: 'completed' }] })
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('old')
    await new Promise(done => setTimeout(done, 120))
    await controller.watchTask('new')
    const deadline = Date.now() + 1500
    while (controller.state.watching && Date.now() < deadline)
      await new Promise(done => setTimeout(done, 10))
    expect((controller.state.task as any).task_id).toBe('new')
    expect((controller.state.task as any).status).toBe('completed')
    oldEvents.resolve(success({ task_id: 'old', last_seq: 2, next_after_seq: null,
      items: [{ seq: 2, kind: 'failed' }] }))
    await new Promise(done => setTimeout(done, 20))
    expect((controller.state.task as any).status).toBe('completed')
    controller.dispose()
  })
})
