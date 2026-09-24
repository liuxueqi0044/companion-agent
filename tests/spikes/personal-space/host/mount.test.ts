import { describe, it, expect } from 'vitest'
import { StableHost, seedRecord } from './state'
import { MountCoordinator, type TrustedFixture } from './mount'
// @ts-expect-error existing local JS package has no declaration in this spike
import { JSDOM } from '../../node_modules/jsdom/lib/api.js'

class MemoryStorage {
  value: string | null = null
  fail = false
  getItem() { return this.value }
  setItem(_key: string, value: string) { if (this.fail) throw new Error('quota'); this.value = value }
}
class Port {
  onmessage: ((event: MessageEvent) => void) | null = null
  peer: Port | null = null
  closed = false
  sent: unknown[] = []
  postMessage(value: unknown) {
    if (this.closed) throw new Error('closed')
    this.sent.push(value)
    if (!this.peer?.closed) this.peer?.onmessage?.({ data:value } as MessageEvent)
  }
  close() { this.closed = true }
}
const fixture = (revision_id: string, hash: string): TrustedFixture => ({
  revision_id, artifact:`<html><head></head><body>${revision_id}</body></html>`, artifact_hash:hash,
  expected_hash:hash, source_type:'handwritten_fixture', host_api_version:'demo/1',
})
const fixtures = new Map([['r1',fixture('r1','a'.repeat(64))], ['r2',fixture('r2','b'.repeat(64))]])
const waitFor = async (check: () => boolean, timeout = 1000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('condition_timeout')
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}
function harness(options: { active?: string; history?: string[];
  hashArtifact?: (artifact: string) => Promise<string>; timeoutMs?: number } = {}) {
  const dom = new JSDOM('<div id="slot"></div>', { url:'http://localhost' })
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, Event:dom.window.Event })
  const storage = new MemoryStorage()
  if (options.active) {
    const record = seedRecord(); record.active_revision = options.active
    record.history = options.history ?? []; record.draft = 'unsent\ntext'
    record.tasks = [{ id:'task', bound_revision:options.active, status:'running' }]
    storage.value = JSON.stringify(record)
  }
  const host = new StableHost(storage, 'mount-test', new Set(['r1','r2']))
  const inits: Array<{ payload: { channel_id:string; revision_id:string; request_id:string;
    artifact_hash:string; base_revision:string|null }; port: Port; source: Window }> = []
  const channels: Array<{ port1: Port; port2: Port }> = []
  const frames: HTMLIFrameElement[] = []
  const messages: string[] = []
  const slot = document.querySelector<HTMLElement>('#slot')!
  const mount = new MountCoordinator(host, slot, fixtures,
    new Set(['read_demo_state','write_demo_draft']), message => messages.push(message), {
      hashArtifact:options.hashArtifact ?? (async artifact => artifact.includes('r2') ? 'b'.repeat(64) : 'a'.repeat(64)),
      createFrame:artifact => { const frame = document.createElement('iframe'); frame.srcdoc = artifact
        frames.push(frame); return frame },
      createChannel:() => {
        const port1 = new Port(), port2 = new Port(); port1.peer = port2; port2.peer = port1
        const pair = { port1, port2 }; channels.push(pair)
        return pair as unknown as MessageChannel
      },
      sendInit:(source, payload, port) => inits.push({ source, payload, port:port as unknown as Port }),
      timeoutMs:options.timeoutMs ?? 100,
    })
  function ready(index: number) {
    const init = inits[index]
    init.port.postMessage({ channel_id:init.payload.channel_id, revision_id:init.payload.revision_id,
      request_id:init.payload.request_id, method:'ready', payload:{ artifact_hash:init.payload.artifact_hash,
        base_revision:init.payload.base_revision } })
  }
  async function loaded(index: number) {
    await waitFor(() => frames.length > index)
    frames[index].dispatchEvent(new dom.window.Event('load'))
    await waitFor(() => inits.length > index)
  }
  return { host, storage, mount, slot, inits, channels, frames, messages, ready, loaded, dom }
}

describe('real iframe mount coordinator with fake local port', () => {
  it('two versions, undo and no-history undo retain a real frame and stable state', async () => {
    const h = harness()
    const first = h.mount.activate('r1'); await h.loaded(0); h.ready(0)
    expect(await first).toBe('active')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
    expect(await h.mount.undo()).toBe('no_previous_revision')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
    const second = h.mount.activate('r2'); await h.loaded(1); h.ready(1)
    expect(await second).toBe('active')
    expect(h.host.record.active_revision).toBe('r2')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
    const undo = h.mount.undo(); await h.loaded(2); h.ready(2)
    expect(await undo).toBe('restored')
    expect(h.host.record.active_revision).toBe('r1')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
  })
  it('old failed operation cannot close the newer ready port or overwrite status', async () => {
    const h = harness({ hashArtifact:async () => 'a'.repeat(64) })
    const old = h.mount.activate('r1'); await h.loaded(0)
    const newer = h.mount.activate('r1'); await h.loaded(1)
    h.ready(1)
    expect(await newer).toBe('active')
    expect(await old).toBe('superseded')
    expect(h.channels[0].port1.closed).toBe(true)
    expect(h.channels[1].port1.closed).toBe(false)
    expect(h.mount.activeFrame).not.toBeNull()
    expect(h.messages.at(-1)).toBe('active')
  })
  it('recovery failure leaves old view, and stop defeats late recovery and hash', async () => {
    const h = harness({ active:'r1', hashArtifact:async () => 'a'.repeat(64), timeoutMs:20 })
    const initial = h.mount.recover(); await h.loaded(0); h.ready(0)
    expect(await initial).toBe('recovered')
    const oldFrame = h.mount.activeFrame
    const failed = h.mount.recover(); await h.loaded(1)
    expect(await failed).toBe('timeout')
    expect(h.mount.activeFrame).toBe(oldFrame)
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
    const later = h.mount.recover(); await h.loaded(2)
    h.mount.stop(); h.ready(2)
    expect(await later).toBe('superseded')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(0)
    let resolveHash!: (value: string) => void
    const lateHash = harness({ hashArtifact:() => new Promise(resolve => { resolveHash = resolve }) })
    const pending = lateHash.mount.activate('r1')
    lateHash.mount.stop(); resolveHash('a'.repeat(64))
    expect(await pending).toBe('superseded')
    expect(lateHash.slot.querySelectorAll('iframe')).toHaveLength(0)
  })
  it('persist failure keeps old pointer and iframe', async () => {
    const h = harness({ active:'r1', hashArtifact:async () => 'a'.repeat(64) })
    const initial = h.mount.recover(); await h.loaded(0); h.ready(0)
    expect(await initial).toBe('recovered')
    const original = h.mount.activeFrame
    // Use the same revision to prove the persistence boundary independently of fixture selection.
    h.storage.fail = true
    const next = h.mount.activate('r1'); await h.loaded(1); h.ready(1)
    expect(await next).toBe('commit_failed')
    expect(h.host.record.active_revision).toBe('r1')
    expect(h.mount.activeFrame).toBe(original)
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
  })
  it('consecutive recovery swaps only ready frames, then stop rejects a pending ready', async () => {
    const h = harness({ active:'r1' })
    const first = h.mount.recover(); await h.loaded(0); h.ready(0)
    expect(await first).toBe('recovered')
    const firstFrame = h.mount.activeFrame
    const second = h.mount.recover(); await h.loaded(1)
    expect(h.mount.activeFrame).toBe(firstFrame)
    h.ready(1)
    expect(await second).toBe('recovered')
    expect(h.mount.activeFrame).not.toBe(firstFrame)
    expect(h.channels[0].port1.closed).toBe(true)
    const third = h.mount.recover(); await h.loaded(2)
    h.mount.stop()
    expect(await third).toBe('superseded')
    expect(h.channels[2].port1.closed).toBe(true)
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(0)
    const restart = h.mount.recover(); await h.loaded(3); h.ready(3)
    expect(await restart).toBe('recovered')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(1)
  })
  it('cancel during hash and stop after ready prevent late mounting without changing draft', async () => {
    let resolveHash!: (value: string) => void
    const h = harness({ active:'r1', hashArtifact:() => new Promise(resolve => { resolveHash = resolve }) })
    const draftBefore = h.host.record.draft
    const pending = h.mount.recover()
    h.mount.cancel(); resolveHash('a'.repeat(64))
    expect(await pending).toBe('superseded')
    expect(h.frames).toHaveLength(0)
    expect(h.host.record.draft).toBe(draftBefore)
    const readyRace = h.mount.recover()
    await waitFor(() => typeof resolveHash === 'function')
    resolveHash('a'.repeat(64)); await h.loaded(0)
    h.ready(0)
    h.mount.stop()
    expect(await readyRace).toBe('superseded')
    expect(h.slot.querySelectorAll('iframe')).toHaveLength(0)
    expect(h.channels[0].port1.closed).toBe(true)
  })
})
