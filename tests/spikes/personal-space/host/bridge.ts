import type { StableHost } from './state'

type PortLike = { postMessage(message: unknown): void; onmessage: ((event: MessageEvent) => void) | null; close(): void }
type Envelope = { channel_id: string; revision_id: string; request_id: string;
  method: 'ready' | 'read_demo_state' | 'write_demo_draft'; payload: Record<string, unknown> }
const enc = new TextEncoder()
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join('|') === keys.sort().join('|')
export class BoundBridge {
  private closed = false
  private count = 0
  private windowStart = Date.now()
  private readyResolve: ((value: { revision_id: string; base_revision: string | null;
    artifact_hash: string; request_id: string }) => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private readySeen = false
  constructor(private readonly port: PortLike, private readonly binding: { channel_id: string;
    revision_id: string; request_id: string; artifact_hash: string; base_revision: string | null },
    private readonly host: StableHost, private readonly grants: ReadonlySet<string>,
    private readonly isCurrentConnection: () => boolean = () => true) {
    port.onmessage = event => this.receive(event.data)
  }
  waitReady() {
    return new Promise<{ revision_id: string; base_revision: string | null; artifact_hash: string; request_id: string }>((resolve, reject) => {
      if (this.closed) { reject(new Error('bridge_closed')); return }
      this.readyResolve = resolve; this.readyReject = reject
    })
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.port.onmessage = null
    this.port.close()
    this.readyReject?.(new Error('bridge_closed'))
    this.readyResolve = null; this.readyReject = null
  }
  private active() {
    return !this.closed && this.readySeen && this.isCurrentConnection()
      && this.host.record.active_revision === this.binding.revision_id
  }
  private canRead() { return this.active() && this.grants.has('read_demo_state') }
  private demoState() {
    const snapshot = this.host.snapshot()
    return { draft:snapshot.draft, tasks:snapshot.tasks, active_revision:snapshot.active_revision }
  }
  stateChanged() {
    if (!this.canRead()) return false
    try {
      this.port.postMessage({ method:'host_state_changed', channel_id:this.binding.channel_id,
        revision_id:this.binding.revision_id, request_id:this.binding.request_id, payload:this.demoState() })
      return true
    } catch { this.close(); return false }
  }
  private reply(method: string, ok: boolean, data: unknown) {
    this.port.postMessage({ method, ok, channel_id:this.binding.channel_id,
      revision_id:this.binding.revision_id, request_id:this.binding.request_id, data })
  }
  receive(value: unknown): string {
    if (this.closed) return 'closed'
    let length: number
    try { length = enc.encode(JSON.stringify(value)).length } catch { return 'invalid_envelope' }
    if (!obj(value) || length > 8192
      || !exact(value, ['channel_id','revision_id','request_id','method','payload'])
      || value.channel_id !== this.binding.channel_id || value.revision_id !== this.binding.revision_id
      || value.request_id !== this.binding.request_id || !obj(value.payload)) return 'invalid_envelope'
    const now = Date.now()
    if (now - this.windowStart > 60_000) { this.windowStart = now; this.count = 0 }
    if (++this.count > 30) return 'rate_limited'
    const message = value as Envelope
    if (message.method === 'ready') {
      if (this.readySeen || !exact(message.payload, ['artifact_hash','base_revision'])
        || message.payload.artifact_hash !== this.binding.artifact_hash
        || message.payload.base_revision !== this.binding.base_revision) return 'ready_invalid'
      this.readySeen = true
      this.readyResolve?.({ revision_id:this.binding.revision_id, base_revision:this.binding.base_revision,
        artifact_hash:this.binding.artifact_hash, request_id:this.binding.request_id })
      return 'ready'
    }
    if (!this.readySeen) return 'not_ready'
    if (!this.active()) return 'not_active'
    if (message.method === 'read_demo_state') {
      if (!exact(message.payload, []) || !this.canRead()) return 'denied'
      this.reply('read_demo_state', true, this.demoState())
      return 'read_demo_state'
    }
    if (message.method === 'write_demo_draft') {
      if (!exact(message.payload, ['draft']) || !this.grants.has('write_demo_draft')
        || typeof message.payload.draft !== 'string') return 'denied'
      try { this.host.writeDraft(message.payload.draft); this.reply('write_demo_draft', true, { saved:true })
      } catch { return 'denied' }
      return 'write_demo_draft'
    }
    return 'method_denied'
  }
}
