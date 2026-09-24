import { BoundBridge } from './bridge'
import type { Candidate, Ready, StableHost } from './state'

export type TrustedFixture = { revision_id: string; artifact: string; artifact_hash: string;
  expected_hash: string; source_type: 'handwritten_fixture'; host_api_version: 'demo/1' }
type Init = { type: 'personal-space-init'; channel_id: string; revision_id: string;
  request_id: string; artifact_hash: string; base_revision: string | null }
type Dependencies = { hashArtifact: (artifact: string) => Promise<string>;
  createFrame: (artifact: string) => HTMLIFrameElement; createChannel: () => MessageChannel;
  sendInit: (source: Window, payload: Init, port: MessagePort) => void; timeoutMs: number }
type Operation = { sequence: number; frame: HTMLIFrameElement | null; bridge: BoundBridge | null;
  timer: ReturnType<typeof setTimeout> | null; reject: ((error: Error) => void) | null }
type Active = { frame: HTMLIFrameElement; bridge: BoundBridge; revision_id: string }

const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'none\'; img-src data:; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">'
export const browserDependencies: Dependencies = {
  hashArtifact: async artifact => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(artifact))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  },
  createFrame: artifact => {
    const frame = document.createElement('iframe')
    frame.title = '手写工程 fixture'
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    frame.style.cssText = 'width:100%;min-height:250px;border:1px solid #999;display:none'
    frame.srcdoc = artifact.replace('<head>', '<head>\n' + csp)
    return frame
  },
  createChannel: () => new MessageChannel(),
  sendInit: (source, payload, port) => source.postMessage(payload, '*', [port]),
  timeoutMs: 3000,
}

export class MountCoordinator {
  private sequence = 0
  private pending: Operation | null = null
  private active: Active | null = null
  constructor(private readonly host: StableHost, private readonly slot: HTMLElement,
    private readonly fixtures: ReadonlyMap<string, TrustedFixture>,
    private readonly grants: ReadonlySet<string>, private readonly onStatus: (message: string) => void,
    private readonly dependencies: Dependencies = browserDependencies) {}

  get activeFrame() { return this.active?.frame ?? null }
  get activeRevision() { return this.active?.revision_id ?? null }
  stateChanged() { return this.active?.bridge.stateChanged() ?? false }
  private cleanup(op: Operation) {
    if (op.timer) clearTimeout(op.timer)
    op.timer = null
    op.reject?.(new Error('mount_cancelled'))
    op.reject = null
    op.bridge?.close()
    op.frame?.remove()
  }
  private begin(): Operation {
    this.sequence++
    if (this.pending) {
      this.cleanup(this.pending)
      this.host.cancel()
    }
    const op: Operation = { sequence:this.sequence, frame:null, bridge:null, timer:null, reject:null }
    this.pending = op
    return op
  }
  private current(op: Operation) { return this.pending === op && this.sequence === op.sequence }
  cancel() {
    this.sequence++
    if (this.pending) this.cleanup(this.pending)
    this.pending = null
    this.host.cancel()
    this.onStatus('cancelled')
  }
  stop() {
    this.cancel()
    this.active?.bridge.close()
    this.active?.frame.remove()
    this.active = null
    this.host.stop()
    this.onStatus('stopped')
  }
  async activate(revision_id: string) { return this.run('activate', revision_id) }
  async recover() {
    const revision = this.host.record.active_revision
    if (!revision) { this.onStatus('no_known_active'); return 'no_known_active' }
    return this.run('recover', revision)
  }
  async undo() {
    const previous = this.host.record.history.at(-1)
    if (!previous) { this.cancel(); this.onStatus('no_previous_revision'); return 'no_previous_revision' }
    return this.run('restore', previous)
  }
  private prepare(op: Operation, fixture: TrustedFixture, request_id: string,
    base_revision: string | null): Promise<Ready> {
    return new Promise<Ready>((resolve, reject) => {
      op.reject = reject
      const frame = this.dependencies.createFrame(fixture.artifact)
      const channel = this.dependencies.createChannel()
      const channel_id = crypto.randomUUID()
      const bridge: BoundBridge = new BoundBridge(channel.port1, { channel_id, revision_id:fixture.revision_id,
        request_id, artifact_hash:fixture.artifact_hash, base_revision }, this.host, this.grants,
        (): boolean => this.active?.bridge === bridge && this.active?.frame === frame)
      op.frame = frame; op.bridge = bridge
      bridge.waitReady().then((value: Ready) => {
        if (op.timer) clearTimeout(op.timer)
        op.timer = null; op.reject = null; resolve(value)
      }, reject)
      frame.addEventListener('load', event => {
        const source = frame.contentWindow
        if (!this.current(op) || event.target !== frame || !source) { reject(new Error('frame_stale')); return }
        this.dependencies.sendInit(source, { type:'personal-space-init', channel_id,
          revision_id:fixture.revision_id, request_id, artifact_hash:fixture.artifact_hash,
          base_revision }, channel.port2)
      }, { once:true })
      op.timer = setTimeout(() => reject(new Error('timeout')), this.dependencies.timeoutMs)
      this.slot.append(frame)
    })
  }
  private async run(mode: 'activate' | 'recover' | 'restore', revision_id: string): Promise<string> {
    const op = this.begin()
    const base_revision = this.host.record.active_revision
    const fixture = this.fixtures.get(revision_id)
    if (!fixture || fixture.source_type !== 'handwritten_fixture'
      || fixture.host_api_version !== 'demo/1' || fixture.revision_id !== revision_id
      || fixture.artifact_hash !== fixture.expected_hash) {
      this.pending = null; this.onStatus('fixture_unavailable'); return 'fixture_unavailable'
    }
    let actualHash: string
    try { actualHash = await this.dependencies.hashArtifact(fixture.artifact) }
    catch { actualHash = '' }
    if (!this.current(op)) return 'superseded'
    if (actualHash !== fixture.expected_hash) {
      this.pending = null; this.onStatus('fixture_hash_invalid'); return 'fixture_hash_invalid'
    }
    const candidate: Candidate = { revision_id, base_revision, artifact_hash:fixture.artifact_hash,
      source_type:'handwritten_fixture' }
    const prepare = (request_id: string) => this.prepare(op, fixture, request_id, base_revision)
    const result = mode === 'activate' ? await this.host.activate(candidate, prepare, this.dependencies.timeoutMs)
      : mode === 'restore' ? await this.host.restorePrevious(candidate, prepare, this.dependencies.timeoutMs)
        : await this.host.recoverCurrent(candidate, prepare, this.dependencies.timeoutMs)
    if (!this.current(op)) { this.cleanup(op); return 'superseded' }
    this.pending = null
    if (result === 'active' || result === 'restored' || result === 'recovered') {
      if (!op.frame || !op.bridge) { this.cleanup(op); this.onStatus('frame_missing'); return 'frame_missing' }
      const old = this.active
      this.active = { frame:op.frame, bridge:op.bridge, revision_id }
      op.frame.style.display = 'block'
      old?.bridge.close(); old?.frame.remove()
      op.bridge.stateChanged()
      this.onStatus(result)
      return result
    }
    this.cleanup(op)
    this.onStatus(result)
    return result
  }
}
