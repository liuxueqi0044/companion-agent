import { describe, expect, it } from 'vitest'
import { LocalTaskController } from '../../../apps/desktop/bridge/client/controller.js'
import type { Action, BridgePort, BridgeReply, Payload } from '../../../apps/desktop/bridge/protocol.js'

const success = (result: any): BridgeReply => ({ kind: 'success', requestId: 'watch', result })
const task = (status = 'running', lastSeq = 1) =>
  ({ task_id: 't', status, last_seq: lastSeq, current_attempt_id: 'attempt' })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function port(fn: (action: Action, payload: Payload) => BridgeReply | Promise<BridgeReply>): BridgePort {
  return { invoke: (action, payload) => Promise.resolve(fn(action, payload)) }
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 1500
  while (!check() && Date.now() < deadline) await new Promise(done => setTimeout(done, 10))
  expect(check()).toBe(true)
}

describe('explicit watch intent survives only its own generation', () => {
  it('invalidates the first snapshot on stop and allows an explicit fresh watch', async () => {
    const old = deferred<BridgeReply>()
    let reads = 0
    let events = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') return ++reads === 1 ? old.promise : success(task())
      if (action === 'task.events') { events += 1; return success({ task_id: 't', items: [], next_after_seq: null }) }
      return success(null)
    }), { pollMs: 100 })
    const first = controller.watchTask('t')
    controller.stopWatch()
    old.resolve(success(task()))
    await first
    expect(controller.state.task).toBeNull()
    expect(controller.state.watching).toBe(false)
    await controller.watchTask('t')
    await until(() => events > 0)
    expect(controller.state.watching).toBe(true)
    controller.dispose()
  })

  it('ignores a task.get refresh after stop during an event poll', async () => {
    const late = deferred<BridgeReply>()
    const entered = deferred<void>()
    let reads = 0
    let eventCalls = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') {
        if (++reads === 1) return success(task())
        entered.resolve()
        return late.promise
      }
      if (action === 'task.events') {
        eventCalls += 1
        return success({ task_id: 't', items: [{ seq: 2, kind: 'started' }], next_after_seq: null })
      }
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    await entered.promise
    controller.stopWatch()
    late.resolve(success(task('running', 2)))
    await new Promise(done => setTimeout(done, 250))
    expect(controller.state.watching).toBe(false)
    expect((controller.state.task as any).last_seq).toBe(1)
    expect(eventCalls).toBe(1)
    controller.dispose()
  })

  it('lets a restart progress while an old event page remains pending', async () => {
    const old = deferred<BridgeReply>()
    let events = 0
    let reads = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') return success(++reads < 3 ? task() : task('completed', 2))
      if (action === 'task.events') return ++events === 1 ? old.promise
        : success({ task_id: 't', items: [{ seq: 2, kind: 'completed' }], next_after_seq: null })
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    await until(() => events === 1)
    controller.stopWatch()
    await controller.watchTask('t')
    await until(() => (controller.state.task as any)?.status === 'completed')
    old.resolve(success({ task_id: 't', items: [{ seq: 9, kind: 'failed' }], next_after_seq: null }))
    await new Promise(done => setTimeout(done, 20))
    expect(controller.state.watching).toBe(false)
    expect(controller.state.taskEvents.map((item: any) => item.seq)).toEqual([2])
    controller.dispose()
  })

  it('treats a stopped single refresh as one read with no implicit watch', async () => {
    let events = 0
    let reads = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') return success(task('running', ++reads))
      if (action === 'task.events') { events += 1; return success({ task_id: 't', items: [], next_after_seq: null }) }
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    controller.stopWatch()
    await controller.refreshSelected()
    await new Promise(done => setTimeout(done, 250))
    expect((controller.state.task as any).last_seq).toBe(2)
    expect(controller.state.watching).toBe(false)
    expect(events).toBe(0)
    controller.dispose()
  })

  it('keeps an explicit existing watch on nonterminal refresh and stops at terminal', async () => {
    let reads = 0
    let events = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') return success(++reads === 3 ? task('completed', 3) : task('running', reads))
      if (action === 'task.events') { events += 1; return success({ task_id: 't', items: [], next_after_seq: null }) }
      return success(null)
    }), { pollMs: 100 })
    await controller.watchTask('t')
    await controller.refreshSelected()
    expect(controller.state.watching).toBe(true)
    await until(() => events > 0)
    await controller.refreshSelected()
    expect(controller.state.watching).toBe(false)
    expect((controller.state.task as any).status).toBe('completed')
    controller.dispose()
  })
})
