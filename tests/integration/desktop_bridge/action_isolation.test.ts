import { describe, expect, it } from 'vitest'
import { LocalTaskController } from '../../../apps/desktop/bridge/client/controller.js'
import type { Action, BridgePort, BridgeReply, Payload } from '../../../apps/desktop/bridge/protocol.js'

const success = (result: any): BridgeReply => ({ kind: 'success', requestId: 'action', result })
const unknown: BridgeReply = { kind: 'transport_error', requestId: 'action',
  code: 'outcome_unknown', cause: 'timeout' }
const business = (code: string): BridgeReply => ({ kind: 'business_error', requestId: 'action', code })
const task = (id: string, status = 'running', lastSeq = 1, attempt = 'a', count = 1) =>
  ({ task_id: id, status, last_seq: lastSeq, current_attempt_id: attempt, attempt_count: count })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function port(fn: (action: Action, payload: Payload) => BridgeReply | Promise<BridgeReply>): BridgePort {
  return { invoke: (action, payload) => Promise.resolve(fn(action, payload)) }
}

describe('old background actions cannot own the replacement view', () => {
  for (const action of ['worker.run-next', 'worker.recover'] as const) {
    for (const outcome of ['success', 'failure'] as const) {
      it(`${action} ${outcome} arrives after a task switch`, async () => {
        const delayed = deferred<BridgeReply>()
        let newReads = 0
        const controller = new LocalTaskController(port((called, payload) => {
          if (called === 'profile.read') return success({ profile_id: 'p', revision: 1 })
          if (called === 'task.get') {
            if (payload.task_id === 'new') newReads += 1
            return success(task(payload.task_id as string))
          }
          if (called === action) return delayed.promise
          return success({ task_id: 'new', items: [], next_after_seq: null })
        }), { pollMs: 100 })
        await controller.connect()
        await controller.watchTask('old')
        const pending = action === 'worker.run-next' ? controller.runNext() : controller.recover()
        await controller.watchTask('new')
        delayed.resolve(outcome === 'success' ? success(action === 'worker.recover'
          ? [task('old', 'interrupted', 2)] : task('old', 'completed', 2)) : unknown)
        expect((await pending).kind).toBe(outcome === 'success' ? 'success' : 'transport_error')
        expect((controller.state.task as any).task_id).toBe('new')
        expect(controller.state.connection).toBe('ready')
        expect(controller.state.taskStale).toBe(false)
        expect(controller.state.taskError).toBeNull()
        expect(newReads).toBe(1) // Old success did not refresh the new task.
        controller.dispose()
      })
    }
  }

  it('profile read cannot clear an unresolved task outcome; explicit task read can', async () => {
    const controller = new LocalTaskController(port((action) => {
      if (action === 'profile.read') return success({ profile_id: 'p', revision: 2 })
      if (action === 'task.get') return success(task('t', 'completed', 3))
      if (action === 'task.result') return success({ task_id: 't', attempt_id: 'a',
        rows: [{ subtotal: '7.00' }], metadata: { total: '7.00' } })
      if (action === 'worker.run-next') return unknown
      if (action === 'profile.change') return business('conflict')
      return success(null)
    }))
    await controller.connect()
    await controller.watchTask('t')
    await controller.loadResultPage({ offset: 0 })
    expect((await controller.runNext()).kind).toBe('transport_error')
    expect(controller.state.taskStale).toBe(true)
    expect(controller.state.taskError?.code).toBe('outcome_unknown')
    await controller.connect()
    expect(controller.state.connection).toBe('ready')
    expect(controller.state.profileStale).toBe(false)
    expect(controller.state.taskStale).toBe(true)
    expect(controller.state.error?.code).toBe('outcome_unknown')
    await controller.refreshSelected()
    expect(controller.state.taskStale).toBe(false)
    expect((controller.state.resultPage as any).metadata.total).toBe('7.00')
    await controller.changeProfile({ command_id: 'same', expected_revision: 1 })
    expect(controller.state.profileStale).toBe(true)
    expect(controller.state.connection).toBe('ready')
    await controller.refreshSelected()
    expect(controller.state.profileStale).toBe(true) // Task read does not clear profile CAS conflict.
    controller.dispose()
  })

  it('retains an old confirmed result but labels it stale after retry and drops a late page', async () => {
    const latePage = deferred<BridgeReply>()
    let pages = 0
    const controller = new LocalTaskController(port((action) => {
      if (action === 'task.get') return success(task('t', 'interrupted', 3, 'a', 1))
      if (action === 'task.result') return ++pages === 1
        ? success({ task_id: 't', attempt_id: 'a', rows: [{ subtotal: '1' }] }) : latePage.promise
      if (action === 'task.retry') return success({ task: task('t', 'queued', 4, 'b', 2) })
      return success(null)
    }))
    await controller.watchTask('t')
    await controller.loadResultPage({ offset: 0 })
    const oldRead = controller.loadResultPage({ offset: 1 })
    await controller.retryTask('same-command')
    expect(controller.state.resultStale).toBe(true)
    latePage.resolve(success({ task_id: 't', attempt_id: 'a', rows: [{ subtotal: '2' }] }))
    await oldRead
    expect((controller.state.resultPage as any).rows[0].subtotal).toBe('1')
    expect((controller.state.task as any).current_attempt_id).toBe('b')
    expect(controller.state.resultStale).toBe(true)
    controller.dispose()
  })

  it('rejects same-seq or older-attempt task snapshots', async () => {
    let reads = 0
    const controller = new LocalTaskController(port(action => {
      if (action === 'task.get') return success(++reads === 1
        ? task('t', 'running', 5, 'b', 2) : task('t', 'completed', 5, 'a', 1))
      return success(null)
    }))
    await controller.watchTask('t')
    await controller.refreshSelected()
    expect((controller.state.task as any).current_attempt_id).toBe('b')
    expect((controller.state.task as any).status).toBe('running')
    controller.dispose()
  })
})
