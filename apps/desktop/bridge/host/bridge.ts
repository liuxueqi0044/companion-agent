/** Node-only fixed Python process bridge. Never import this into renderer code. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { ACTIONS, VERSION, type Action, type BridgePort, type BridgeReply, type JsonValue, type Payload } from '../protocol.js'

const INPUT_MAX = 384 * 1024
const OUTPUT_MAX = 1024 * 1024
const STDERR_MAX = 8 * 1024
const READ_ONLY = new Set<Action>(['profile.read', 'task.get', 'task.list', 'task.events', 'task.result'])
const ACTION_SET = new Set<string>(ACTIONS)
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/

/** This constructor is host/test only. No value here is accepted from a page request. */
export interface TrustedProcessConfig {
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  shortTimeoutMs?: number
  workerTimeoutMs?: number
  disposeTimeoutMs?: number
  maxShortRequests?: number
  spawnChild?: typeof spawn
}

interface Active {
  fail: (cause: string) => void
  closed: Promise<void>
}

export interface DisposeResult {
  closed: boolean
  activeProcesses: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON.parse silently keeps the last duplicate object key. The wire format forbids ambiguity. */
function hasDuplicateKey(json: string): boolean {
  const frames: Array<{ object: boolean; expectKey: boolean; keys: Set<string> }> = []
  for (let at = 0; at < json.length; at += 1) {
    const char = json[at]
    if (char === '{' || char === '[') {
      frames.push({ object: char === '{', expectKey: char === '{', keys: new Set() })
    } else if (char === '}' || char === ']') {
      frames.pop()
    } else if (char === ',') {
      const top = frames.at(-1)
      if (top?.object) top.expectKey = true
    } else if (char === '"') {
      const start = at
      at += 1
      while (at < json.length) {
        if (json[at] === '\\') at += 2
        else if (json[at] === '"') break
        else at += 1
      }
      const top = frames.at(-1)
      if (top?.object && top.expectKey) {
        const key = JSON.parse(json.slice(start, at + 1)) as string
        if (top.keys.has(key)) return true
        top.keys.add(key)
        top.expectKey = false
      }
    }
  }
  return false
}

function classify(action: Action, sent: boolean, cause: string): 'unavailable' | 'protocol_error' | 'outcome_unknown' {
  if (!sent) return 'unavailable'
  if (!READ_ONLY.has(action)) return 'outcome_unknown'
  return cause === 'timeout' || cause === 'spawn_error' || cause === 'disposed' ? 'unavailable' : 'protocol_error'
}

function validatedEnvelope(text: string, requestId: string, exitCode: number | null): BridgeReply | null {
  if (!text.endsWith('\n') || text.indexOf('\n') !== text.length - 1) return null
  let value: unknown
  try {
    const json = text.slice(0, -1)
    value = JSON.parse(json)
    if (hasDuplicateKey(json)) return null
  } catch { return null }
  if (!isObject(value) || Object.keys(value).sort().join(',') !== 'error,ok,request_id,result,version') return null
  if (value.version !== VERSION || value.request_id !== requestId || typeof value.ok !== 'boolean') return null
  if (value.ok) {
    if (exitCode !== 0 || value.error !== null || value.result === undefined) return null
    return { kind: 'success', requestId, result: value.result as JsonValue }
  }
  if (exitCode !== 0 || value.result !== null || !isObject(value.error)) return null
  if (Object.keys(value.error).sort().join(',') !== 'code,kind' ||
      value.error.kind !== 'business' || typeof value.error.code !== 'string' ||
      !ERROR_CODE.test(value.error.code)) return null
  return { kind: 'business_error', requestId, code: value.error.code }
}

export class LocalProcessBridge implements BridgePort {
  private readonly config: Required<Omit<TrustedProcessConfig, 'spawnChild'>> & { spawnChild: typeof spawn }
  private readonly active = new Set<Active>()
  private shortCount = 0
  private workerActive = false
  private disposed = false
  private disposePromise: Promise<DisposeResult> | null = null

  constructor(config: TrustedProcessConfig) {
    if (!config.executable || !config.cwd || !config.args.length) throw new Error('invalid_trusted_config')
    this.config = {
      ...config,
      args: Object.freeze([...config.args]),
      env: Object.freeze({ ...config.env }),
      shortTimeoutMs: config.shortTimeoutMs ?? 10_000,
      workerTimeoutMs: config.workerTimeoutMs ?? 60_000,
      disposeTimeoutMs: config.disposeTimeoutMs ?? 2_000,
      maxShortRequests: config.maxShortRequests ?? 4,
      spawnChild: config.spawnChild ?? spawn,
    }
    if (this.config.shortTimeoutMs < 1 || this.config.workerTimeoutMs < 1 ||
        this.config.disposeTimeoutMs < 1 ||
        this.config.maxShortRequests < 1) throw new Error('invalid_trusted_config')
  }

  diagnostics(): { activeProcesses: number; shortRequests: number; workerActive: boolean; disposed: boolean } {
    return { activeProcesses: this.active.size, shortRequests: this.shortCount,
      workerActive: this.workerActive, disposed: this.disposed }
  }

  invoke(action: Action, payload: Payload): Promise<BridgeReply> {
    const requestId = randomUUID()
    const error = (code: 'unavailable' | 'protocol_error' | 'outcome_unknown', cause: string): BridgeReply =>
      ({ kind: 'transport_error', requestId, code, cause })
    if (this.disposed) return Promise.resolve(error('unavailable', 'disposed'))
    if (!ACTION_SET.has(action) || !isObject(payload)) return Promise.resolve(error('protocol_error', 'invalid_request'))
    const worker = action === 'worker.run-next'
    if (worker ? this.workerActive : this.shortCount >= this.config.maxShortRequests)
      return Promise.resolve(error('unavailable', 'busy'))
    let raw: Buffer
    try { raw = Buffer.from(JSON.stringify({ version: VERSION, request_id: requestId, action, payload }) + '\n', 'utf8') }
    catch { return Promise.resolve(error('protocol_error', 'invalid_request')) }
    if (raw.byteLength > INPUT_MAX) return Promise.resolve(error('protocol_error', 'input_limit'))
    if (worker) this.workerActive = true
    else this.shortCount += 1
    return new Promise<BridgeReply>((resolveReply) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = this.config.spawnChild(this.config.executable, [...this.config.args], {
          cwd: this.config.cwd, env: { ...this.config.env }, shell: false,
          windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch {
        if (worker) this.workerActive = false
        else this.shortCount -= 1
        resolveReply(error('unavailable', 'spawn_error'))
        return
      }
      let settled = false
      let closing = false
      let closedFlag = false
      let sent = false
      let stdoutBytes = 0
      let stderrBytes = 0
      const chunks: Buffer[] = []
      let closeResolve: () => void = () => {}
      const closed = new Promise<void>((done) => { closeResolve = done })
      const active: Active = { fail: (cause) => requestStop(cause), closed }
      this.active.add(active)
      let timer: ReturnType<typeof setTimeout> | null = null
      const settle = (reply: BridgeReply) => {
        if (settled) return
        settled = true
        resolveReply(reply)
      }
      const requestStop = (cause: string, code?: 'unavailable') => {
        if (closedFlag) return
        if (!closing) {
          closing = true
          if (timer !== null) clearTimeout(timer)
          settle(error(code ?? classify(action, sent, cause), cause))
        }
        // A kill request is not evidence of exit. Keep ownership and the slot until close.
        try { child.kill() } catch { /* dispose reports any child that does not close */ }
      }
      const onStdout = (chunk: Buffer) => {
        if (closing) return
        stdoutBytes += chunk.byteLength
        if (stdoutBytes > OUTPUT_MAX) { requestStop('stdout_limit'); return }
        chunks.push(chunk)
      }
      const onStderr = (chunk: Buffer) => {
        if (closing) return
        stderrBytes += chunk.byteLength
        if (stderrBytes > STDERR_MAX) requestStop('stderr_limit')
      }
      const onPipeError = () => requestStop('pipe_error')
      const onChildError = () => requestStop('spawn_error', child.pid === undefined ? 'unavailable' : undefined)
      const onClose = (code: number | null) => {
        if (closedFlag) return
        closedFlag = true
        if (timer !== null) clearTimeout(timer)
        child.stdout.off('data', onStdout)
        child.stderr.off('data', onStderr)
        child.stdin.off('error', onPipeError)
        child.off('error', onChildError)
        child.off('close', onClose)
        this.active.delete(active)
        if (worker) this.workerActive = false
        else this.shortCount -= 1
        closeResolve()
        if (settled) return
        let decoded: string
        try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
        catch { settle(error(classify(action, sent, 'invalid_utf8'), 'invalid_utf8')); return }
        const reply = validatedEnvelope(decoded, requestId, code)
        if (reply === null) settle(error(classify(action, sent, 'protocol_error'), 'protocol_error'))
        else settle(reply)
      }
      child.stdout.on('data', onStdout)
      child.stderr.on('data', onStderr)
      child.stdin.on('error', onPipeError)
      child.on('error', onChildError)
      child.on('close', onClose)
      timer = setTimeout(() => requestStop('timeout'),
        worker ? this.config.workerTimeoutMs : this.config.shortTimeoutMs)
      sent = true // It may be committed even if the pipe callback or response is lost.
      try { child.stdin.end(raw) } catch { requestStop('pipe_error') }
    })
  }

  dispose(): Promise<DisposeResult> {
    if (this.disposePromise !== null) return this.disposePromise
    this.disposed = true
    // Defer work one microtask so concurrent/reentrant calls share this exact promise.
    this.disposePromise = Promise.resolve().then(() => this.finishDispose())
    return this.disposePromise
  }

  private async finishDispose(): Promise<DisposeResult> {
    const pending = [...this.active]
    for (const item of pending) item.fail('disposed')
    if (!pending.length) return { closed: true, activeProcesses: 0 }
    let timeout: ReturnType<typeof setTimeout> | null = null
    const elapsed = new Promise<boolean>(done => {
      timeout = setTimeout(() => done(false), this.config.disposeTimeoutMs)
    })
    const allClosed = Promise.all(pending.map(item => item.closed)).then(() => true)
    const withinLimit = await Promise.race([allClosed, elapsed])
    if (timeout !== null) clearTimeout(timeout)
    return { closed: withinLimit || this.active.size === 0, activeProcesses: this.active.size }
  }
}

/** Called only from future trusted main, never from renderer or request payload. */
export function createDevelopmentBridge(repoRoot: string): LocalProcessBridge {
  const root = resolve(repoRoot)
  const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const entry = join(root, 'tools', 'desktop_bridge.py')
  if (!existsSync(python) || !existsSync(entry) || !existsSync(join(root, 'apps/desktop/package.json')))
    throw new Error('development_runtime_unavailable')
  const env: Record<string, string> = { PYTHONNOUSERSITE: '1', PYTHONUTF8: '1' }
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
    if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  } else env.LANG = 'C.UTF-8'
  return new LocalProcessBridge({ executable: python, args: ['-I', entry], cwd: root, env })
}
