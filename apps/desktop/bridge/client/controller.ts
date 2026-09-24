/** Headless client controller. No Node, filesystem, process, SQL or UI imports. */
import type { Action, BridgePort, BridgeReply, JsonValue, Payload } from '../protocol.js'

export type Connection = 'disconnected' | 'loading' | 'ready' | 'error'
export interface ClientError { code: string; cause?: string }
export interface ClientState {
  connection: Connection
  profile: JsonValue | null
  task: JsonValue | null
  taskEvents: JsonValue[]
  resultPage: JsonValue | null
  lastSeq: number
  watching: boolean
  stale: boolean
  error: ClientError | null
  profileStale: boolean
  taskStale: boolean
  resultStale: boolean
  profileError: ClientError | null
  taskError: ClientError | null
  resultError: ClientError | null
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function text(value: unknown): string | null { return typeof value === 'string' ? value : null }
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}
function taskId(value: unknown): string | null { return text(object(value)?.task_id) }
function status(value: unknown): string | null { return text(object(value)?.status) }
function seq(value: unknown): number | null { return integer(object(value)?.last_seq) }
function taskFromReceipt(value: unknown): JsonValue | null {
  const candidate = object(value)?.task
  return object(candidate) ? candidate as JsonValue : null
}
function attempt(value: unknown): string | null { return text(object(value)?.current_attempt_id) }
function attemptCount(value: unknown): number | null { return integer(object(value)?.attempt_count) }

export class LocalTaskController {
  private readonly listeners = new Set<(state: ClientState) => void>()
  private readonly port: BridgePort
  private readonly pollMs: number
  private stateValue: ClientState = {
    connection: 'disconnected', profile: null, task: null, taskEvents: [],
    resultPage: null, lastSeq: 0, watching: false, stale: false, error: null,
    profileStale: false, taskStale: false, resultStale: false,
    profileError: null, taskError: null, resultError: null,
  }
  private disposed = false
  private connectionEpoch = 0
  private viewEpoch = 0
  private watchEpoch = 0
  private watchIntent = false
  private resultReadEpoch = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private pollingWatchEpoch: number | null = null
  private cursor = 0

  constructor(port: BridgePort, options: { pollMs?: number } = {}) {
    this.port = port
    this.pollMs = Math.max(100, options.pollMs ?? 500)
  }

  get state(): ClientState { return structuredClone(this.stateValue) }

  subscribe(listener: (state: ClientState) => void): () => void {
    if (this.disposed) throw new Error('disposed')
    this.listeners.add(listener)
    listener(this.state)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    const snapshot = this.state
    for (const listener of this.listeners) {
      try { listener(structuredClone(snapshot)) } catch { /* one consumer cannot stop others */ }
    }
  }

  private update(patch: Partial<ClientState>): void {
    if (this.disposed) return
    const next = { ...this.stateValue, ...patch }
    next.stale = next.profileStale || next.taskStale || next.resultStale
    next.error = next.taskError ?? next.resultError ?? next.profileError
    this.stateValue = next
    this.emit()
  }

  private problem(reply: BridgeReply, domain: 'profile' | 'task' | 'result', connectionFailure = false): void {
    if (reply.kind === 'success') return
    const issue: ClientError = { code: reply.code,
      ...(reply.kind === 'transport_error' ? { cause: reply.cause } : {}) }
    if (domain === 'profile') {
      if (connectionFailure) this.stopWatch()
      this.update({ profileStale: true, profileError: issue,
        ...(connectionFailure ? { connection: 'error' as const,
          taskStale: this.stateValue.task !== null || this.stateValue.taskStale,
          resultStale: this.stateValue.resultPage !== null || this.stateValue.resultStale } : {}) })
    } else if (domain === 'task') {
      this.stopWatch()
      this.update({ taskStale: true, taskError: issue })
    } else this.update({ resultStale: true, resultError: issue })
  }

  private async invoke(action: Action, payload: Payload): Promise<BridgeReply> {
    if (this.disposed) return { kind: 'transport_error', requestId: '', code: 'unavailable', cause: 'disposed' }
    try { return await this.port.invoke(action, payload) }
    catch { return { kind: 'transport_error', requestId: '', code: 'unavailable', cause: 'port_rejected' } }
  }

  private acceptsTask(snapshot: JsonValue, id: string): boolean {
    if (taskId(snapshot) !== id || (seq(snapshot) ?? -1) < this.stateValue.lastSeq) return false
    const current = this.stateValue.task
    const oldCount = attemptCount(current)
    const newCount = attemptCount(snapshot)
    if (oldCount !== null && newCount !== null && newCount < oldCount) return false
    if (seq(snapshot) === seq(current) && attempt(current) !== null &&
        attempt(snapshot) !== null && attempt(snapshot) !== attempt(current)) return false
    return true
  }

  private resultOutdatedBy(snapshot: JsonValue): boolean {
    return this.stateValue.resultPage !== null && attempt(this.stateValue.task) !== null &&
      attempt(snapshot) !== null && attempt(this.stateValue.task) !== attempt(snapshot)
  }

  async connect(): Promise<BridgeReply> {
    const epoch = ++this.connectionEpoch
    this.update({ connection: 'loading', profileError: null })
    const reply = await this.invoke('profile.read', {})
    if (this.disposed || epoch !== this.connectionEpoch) return reply
    if (reply.kind === 'success') this.update({ connection: 'ready', profile: reply.result,
      profileStale: false, profileError: null })
    else this.problem(reply, 'profile', true)
    return reply
  }

  async bootstrap(): Promise<BridgeReply> {
    const epoch = ++this.connectionEpoch
    this.update({ connection: 'loading', profileError: null })
    const reply = await this.invoke('bootstrap', {})
    if (this.disposed || epoch !== this.connectionEpoch) return reply
    if (reply.kind === 'success') this.update({ connection: 'ready', profile: reply.result,
      profileStale: false, profileError: null })
    else this.problem(reply, 'profile', true)
    return reply
  }

  private async profileMutation(action: 'profile.change' | 'profile.undo', payload: Payload): Promise<BridgeReply> {
    const epoch = ++this.connectionEpoch
    const reply = await this.invoke(action, payload)
    if (this.disposed || epoch !== this.connectionEpoch) return reply
    if (reply.kind === 'success') {
      const current = object(reply.result)?.current_snapshot
      this.update({ profile: (current ?? this.stateValue.profile) as JsonValue,
        connection: 'ready', profileStale: false, profileError: null })
    } else this.problem(reply, 'profile') // CAS conflict is explicit; no automatic overwrite/retry.
    return reply
  }
  changeProfile(payload: Payload): Promise<BridgeReply> { return this.profileMutation('profile.change', payload) }
  undoProfile(payload: Payload): Promise<BridgeReply> { return this.profileMutation('profile.undo', payload) }

  async submitTask(payload: Payload): Promise<BridgeReply> {
    const epoch = ++this.viewEpoch
    this.stopWatch()
    const reply = await this.invoke('task.submit', payload)
    if (this.disposed || epoch !== this.viewEpoch) return reply
    if (reply.kind !== 'success') { this.problem(reply, 'task'); return reply }
    const task = taskFromReceipt(reply.result)
    if (task) {
      this.cursor = seq(task) ?? 0
      this.update({ task, taskEvents: [], resultPage: null, lastSeq: this.cursor,
        taskStale: false, resultStale: false, taskError: null, resultError: null })
    }
    return reply
  }

  async watchTask(id: string): Promise<BridgeReply> {
    const view = ++this.viewEpoch
    this.stopWatch()
    const watch = ++this.watchEpoch
    this.watchIntent = true
    this.update({ taskStale: this.stateValue.task !== null, taskError: null,
      resultStale: this.stateValue.resultPage !== null })
    const reply = await this.invoke('task.get', { task_id: id })
    if (!this.currentWatch(view, watch)) return reply
    if (reply.kind !== 'success') { this.problem(reply, 'task'); return reply }
    const snapshot = reply.result
    if (taskId(snapshot) !== id || seq(snapshot) === null) {
      this.problem({ kind: 'transport_error', requestId: reply.requestId,
        code: 'protocol_error', cause: 'invalid_task_snapshot' }, 'task')
      return reply
    }
    this.cursor = seq(snapshot) ?? 0
    const watching = !TERMINAL.has(status(snapshot) ?? '')
    this.watchIntent = watching
    this.update({ task: snapshot, taskEvents: [], resultPage: null, lastSeq: this.cursor,
      watching, taskStale: false, resultStale: false, taskError: null, resultError: null })
    this.schedule(view, watch)
    return reply
  }

  private currentWatch(view: number, watch: number, id?: string): boolean {
    return !this.disposed && this.watchIntent && view === this.viewEpoch && watch === this.watchEpoch &&
      (id === undefined || taskId(this.stateValue.task) === id)
  }

  private schedule(view: number, watch: number, immediate = false): void {
    if (!this.currentWatch(view, watch) || !this.stateValue.watching ||
        this.timer !== null || this.pollingWatchEpoch === watch) return
    const timer = setTimeout(() => {
      if (this.timer === timer) this.timer = null
      void this.poll(view, watch)
    }, immediate ? 0 : this.pollMs)
    this.timer = timer
  }

  private async poll(view: number, watch: number): Promise<void> {
    if (!this.currentWatch(view, watch) || this.pollingWatchEpoch === watch || !this.stateValue.watching) return
    const id = taskId(this.stateValue.task)
    if (!id) return
    this.pollingWatchEpoch = watch
    let more = false
    try {
      const reply = await this.invoke('task.events', { task_id: id, after_seq: this.cursor, limit: 100 })
      if (!this.currentWatch(view, watch, id) || !this.stateValue.watching) return
      if (reply.kind !== 'success') { this.problem(reply, 'task'); return }
      const page = object(reply.result)
      const items = page?.items
      if (!Array.isArray(items) || page?.task_id !== id) {
        this.problem({ kind: 'transport_error', requestId: reply.requestId,
          code: 'protocol_error', cause: 'invalid_event_page' }, 'task')
        return
      }
      const fresh = items.filter(item => {
        const eventSeq = integer(object(item)?.seq)
        return eventSeq !== null && eventSeq > this.cursor
      })
      for (const item of fresh) this.cursor = Math.max(this.cursor, integer(object(item)?.seq) ?? 0)
      if (fresh.length) {
        this.update({ taskEvents: [...this.stateValue.taskEvents, ...fresh as JsonValue[]], lastSeq: this.cursor })
      }
      more = page?.next_after_seq !== null && page?.next_after_seq !== undefined
      if (more && !fresh.length) {
        this.problem({ kind: 'transport_error', requestId: reply.requestId,
          code: 'protocol_error', cause: 'nonprogress_event_cursor' }, 'task')
        return
      }
      if (fresh.length || (seq(this.stateValue.task) ?? 0) < this.cursor)
        await this.refreshTask(view, watch, id)
      if (!this.currentWatch(view, watch, id) || !this.stateValue.watching) return
    } finally {
      if (this.pollingWatchEpoch === watch) this.pollingWatchEpoch = null
      this.schedule(view, watch, more)
    }
  }

  private async refreshTask(view: number, watch: number, id: string): Promise<void> {
    const reply = await this.invoke('task.get', { task_id: id })
    if (!this.currentWatch(view, watch, id) || !this.stateValue.watching) return
    if (reply.kind !== 'success') { this.problem(reply, 'task'); return }
    if (!this.acceptsTask(reply.result, id)) return
    const terminal = TERMINAL.has(status(reply.result) ?? '')
    this.update({ task: reply.result, lastSeq: Math.max(this.stateValue.lastSeq, seq(reply.result) ?? 0),
      watching: !terminal, taskStale: false, taskError: null,
      resultStale: this.resultOutdatedBy(reply.result) || this.stateValue.resultStale })
    if (terminal) this.stopWatch()
  }

  async refreshSelected(): Promise<BridgeReply | null> {
    const id = taskId(this.stateValue.task)
    if (!id) return null
    const epoch = this.viewEpoch
    const reply = await this.invoke('task.get', { task_id: id })
    if (this.disposed || epoch !== this.viewEpoch) return reply
    if (reply.kind !== 'success') { this.problem(reply, 'task'); return reply }
    if (this.acceptsTask(reply.result, id)) {
      const terminal = TERMINAL.has(status(reply.result) ?? '')
      this.update({ task: reply.result, lastSeq: seq(reply.result) ?? this.stateValue.lastSeq,
        watching: this.stateValue.watching && !terminal, taskStale: false, taskError: null,
        resultStale: this.resultOutdatedBy(reply.result) || this.stateValue.resultStale })
      if (terminal) this.stopWatch()
    }
    return reply
  }

  async loadResultPage(payload: Payload): Promise<BridgeReply> {
    const epoch = this.viewEpoch
    const read = ++this.resultReadEpoch
    const id = taskId(this.stateValue.task)
    const expectedAttempt = attempt(this.stateValue.task)
    if (!id) return { kind: 'transport_error', requestId: '', code: 'unavailable', cause: 'no_selected_task' }
    const reply = await this.invoke('task.result', { ...payload, task_id: id })
    if (this.disposed || epoch !== this.viewEpoch || read !== this.resultReadEpoch ||
        expectedAttempt !== attempt(this.stateValue.task)) return reply
    if (reply.kind === 'success') {
      const page = object(reply.result)
      if ((page?.task_id !== undefined && page.task_id !== id) ||
          (page?.attempt_id !== undefined && page.attempt_id !== expectedAttempt)) {
        this.problem({ kind: 'transport_error', requestId: reply.requestId,
          code: 'protocol_error', cause: 'invalid_result_page' }, 'result')
      } else this.update({ resultPage: reply.result, resultStale: false, resultError: null })
    } else this.problem(reply, 'result')
    return reply
  }

  private async taskMutation(action: 'task.cancel' | 'task.retry', commandId: string): Promise<BridgeReply> {
    const epoch = this.viewEpoch
    const id = taskId(this.stateValue.task)
    if (!id) return { kind: 'transport_error', requestId: '', code: 'unavailable', cause: 'no_selected_task' }
    const reply = await this.invoke(action, { task_id: id, command_id: commandId })
    if (this.disposed || epoch !== this.viewEpoch) return reply
    if (reply.kind !== 'success') { this.problem(reply, 'task'); return reply }
    const task = taskFromReceipt(reply.result)
    if (task && this.acceptsTask(task, id)) {
      const watching = this.stateValue.watching && !TERMINAL.has(status(task) ?? '')
      this.cursor = Math.max(this.cursor, seq(task) ?? 0)
      this.update({ task, lastSeq: this.cursor, watching, taskStale: false, taskError: null,
        resultStale: this.resultOutdatedBy(task) || this.stateValue.resultStale })
      if (!watching) this.stopWatch()
      else this.schedule(epoch, this.watchEpoch)
    }
    return reply
  }
  cancelTask(commandId: string): Promise<BridgeReply> { return this.taskMutation('task.cancel', commandId) }
  retryTask(commandId: string): Promise<BridgeReply> { return this.taskMutation('task.retry', commandId) }

  private async backgroundAction(action: 'worker.run-next' | 'worker.recover'): Promise<BridgeReply> {
    const view = this.viewEpoch
    const selected = taskId(this.stateValue.task)
    const reply = await this.invoke(action, {})
    // The caller still receives its real receipt. A replacement view owns its own state.
    if (this.disposed || view !== this.viewEpoch || selected !== taskId(this.stateValue.task)) return reply
    if (reply.kind !== 'success') {
      if (selected !== null) this.problem(reply, 'task')
    } else if (selected !== null) await this.refreshSelected() // Read the authoritative DB snapshot.
    return reply
  }
  runNext(): Promise<BridgeReply> { return this.backgroundAction('worker.run-next') }
  recover(): Promise<BridgeReply> { return this.backgroundAction('worker.recover') }

  stopWatch(): void {
    const wasWatching = this.stateValue.watching
    this.watchIntent = false
    this.watchEpoch += 1
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (wasWatching) this.update({ watching: false,
      taskStale: this.stateValue.taskStale || !TERMINAL.has(status(this.stateValue.task) ?? '') })
  }

  dispose(): void {
    if (this.disposed) return
    this.stopWatch()
    this.disposed = true
    this.viewEpoch += 1
    this.connectionEpoch += 1
    this.resultReadEpoch += 1
    this.listeners.clear()
    this.stateValue = { ...this.stateValue, connection: 'disconnected', watching: false }
  }
}
