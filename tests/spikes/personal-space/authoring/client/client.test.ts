import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// @ts-expect-error existing local jsdom package has no declaration in this spike
import { JSDOM } from 'jsdom'
import { BoundBridge } from '../../host/bridge'
import { StableHost, seedRecord } from '../../host/state'

const source = readFileSync(fileURLToPath(new URL('./client-runtime.js', import.meta.url)), 'utf8')
const binding = { type:'personal-space-init', channel_id:'c1', revision_id:'r1',
  request_id:'request-1', artifact_hash:'a'.repeat(64), base_revision:null }
class Port {
  peer: Port | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  sent: unknown[] = []
  closed = false
  postMessage(message: unknown) {
    this.sent.push(message)
    if (!this.closed && !this.peer?.closed) queueMicrotask(() => this.peer?.onmessage?.({ data:message } as MessageEvent))
  }
  close() { this.closed = true }
}
function harness(grants = new Set(['read_demo_state','write_demo_draft']), clock?: () => number) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts:'outside-only', url:'http://localhost' })
  Object.assign(dom.window, { TextEncoder, TextDecoder })
  if (clock) dom.window.Date.now = clock
  dom.window.eval(source) // Fixed, repository-owned SDK only.
  const client = (dom.window as unknown as { PersonalSpace: any }).PersonalSpace
  const a = new Port(), b = new Port(); a.peer = b; b.peer = a
  const record = seedRecord(); record.active_revision = 'r1'
  const host = new StableHost({ getItem:() => JSON.stringify(record), setItem:() => {} })
  const current = { value:true }
  const bridge = new BoundBridge(a, binding, host, grants, () => current.value)
  const init = (data: object = binding, sourceWindow: Window | null = dom.window.parent) => {
    const event = new dom.window.MessageEvent('message', { data, source:sourceWindow, ports:[b as unknown as MessagePort] })
    dom.window.dispatchEvent(event)
  }
  return { dom, client, bridge, host, a, b, grants, current, init }
}
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve))

describe('space-client/1 against the actual BoundBridge', () => {
  it('ignores foreign init, sends exact ready, waits for active state, reads independent copies and saves on real ACK', async () => {
    const h = harness()
    const waiting = h.client.connect({ timeoutMs:100 })
    h.init(binding, null)
    h.init({ ...binding, base_revision:undefined })
    expect(h.b.sent).toHaveLength(0)
    h.init(); await tick()
    expect(h.b.sent[0]).toEqual({ channel_id:'c1', revision_id:'r1', request_id:'request-1',
      method:'ready', payload:{ artifact_hash:binding.artifact_hash, base_revision:null } })
    expect(h.client.status()).toBe('waiting_active')
    expect(h.client.snapshot()).toBeNull()
    expect(h.bridge.stateChanged()).toBe(true)
    await waiting
    const snapshot = h.client.snapshot(); snapshot.draft = 'forged'; snapshot.tasks[0].status = 'running'
    expect(h.client.snapshot().draft).toBe('')
    expect(h.client.snapshot().tasks[0].status).toBe('unavailable')
    expect(await h.client.saveDraft('saved')).toEqual({ saved:true, revision_id:'r1' })
    expect(h.host.record.draft).toBe('saved')
    expect((await h.client.refresh()).draft).toBe('saved')
    h.client.dispose(); expect(h.b.closed).toBe(true)
  })
  it('does not accept malformed/foreign state or ACK and freezes writes after an uncertain timeout', async () => {
    const h = harness()
    const waiting = h.client.connect({ timeoutMs:100 })
    h.init(); await tick()
    h.b.onmessage?.({ data:{ method:'host_state_changed', channel_id:'wrong', revision_id:'r1',
      request_id:'request-1', payload:{ draft:'forged',tasks:[],active_revision:'r1' } } } as MessageEvent)
    expect(h.client.status()).toBe('waiting_active')
    const cyclic: any = { method:'host_state_changed', channel_id:'c1', revision_id:'r1',
      request_id:'request-1', payload:{ draft:'forged',tasks:[],active_revision:'r1' } }
    cyclic.loop = cyclic
    expect(() => h.b.onmessage?.({ data:cyclic } as MessageEvent)).not.toThrow()
    h.bridge.stateChanged(); await waiting
    const original = h.a.postMessage.bind(h.a)
    h.a.postMessage = (message: unknown) => { if ((message as any).method !== 'write_demo_draft') original(message) }
    const first = h.client.saveDraft('a', 5)
    await expect(h.client.saveDraft('b')).rejects.toMatchObject({ code:'busy' })
    await expect(first).rejects.toMatchObject({ code:'save_timeout' })
    h.b.onmessage?.({ data:{ method:'write_demo_draft', ok:true, channel_id:'c1', revision_id:'r1',
      request_id:'request-1', data:{ saved:true } } } as MessageEvent)
    await expect(h.client.saveDraft('later')).rejects.toMatchObject({ code:'write_uncertain_reconnect_required' })
    expect(h.host.record.draft).toBe('a')
    const fresh = h.client.reconnect()
    expect(fresh.status()).toBe('waiting_init')
    h.bridge.close()
  })
  it('respects grant, size, activation and close boundaries', async () => {
    const h = harness(new Set(['write_demo_draft']))
    const waiting = h.client.connect({ timeoutMs:10 })
    h.init(); await tick()
    expect(h.bridge.stateChanged()).toBe(false)
    await expect(waiting).rejects.toMatchObject({ code:'connect_timeout' })
    await expect(h.client.saveDraft('x')).rejects.toMatchObject({ code:'unavailable' })
    const another = harness()
    const active = another.client.connect({ timeoutMs:100 }); another.init(); await tick()
    another.bridge.stateChanged(); await active
    await expect(another.client.saveDraft('😀'.repeat(2100))).rejects.toMatchObject({ code:'invalid_draft' })
    await expect(another.client.saveDraft('x'.repeat(8120))).rejects.toMatchObject({ code:'message_too_large' })
    another.client.dispose()
    await expect(another.client.saveDraft('x')).rejects.toMatchObject({ code:'unavailable' })
  })
  it('does not claim saved after grant revocation or replacement by a same-revision connection', async () => {
    const h = harness()
    const active = h.client.connect({ timeoutMs:100 }); h.init(); await tick()
    h.bridge.stateChanged(); await active
    h.grants.delete('write_demo_draft')
    await expect(h.client.saveDraft('denied',5)).rejects.toMatchObject({ code:'save_timeout' })
    expect(h.host.record.draft).toBe('')
    const newer = h.client.reconnect()
    expect(newer.status()).toBe('waiting_init')
    const second = harness()
    const ready = second.client.connect({ timeoutMs:100 }); second.init(); await tick()
    second.bridge.stateChanged(); await ready
    second.current.value = false // MountCoordinator has switched to a newer bridge of the same revision.
    expect(second.bridge.stateChanged()).toBe(false)
    await expect(second.client.saveDraft('stale',5)).rejects.toMatchObject({ code:'save_timeout' })
    expect(second.host.record.draft).toBe('')
  })
  it('counts ready in the 30-message window, refuses duplicate init and bounds the complete envelope', async () => {
    let now = 1000
    const hostClock = vi.spyOn(Date,'now').mockImplementation(() => now)
    try {
    const h = harness(undefined, () => now)
    const start = now
    const ready = h.client.connect({ timeoutMs:100 }); h.init(); await tick()
    h.bridge.stateChanged(); await ready
    h.init({ ...binding, channel_id:'replacement' })
    expect(h.b.sent).toHaveLength(1)
    for (let i=0; i<29; i++) {
      try { await h.client.refresh(100) }
      catch (cause: any) { throw new Error(`read-${i}:${cause.code}:sent-${h.b.sent.length}`) }
    }
    expect(h.b.sent).toHaveLength(30)
    await expect(h.client.refresh()).rejects.toMatchObject({ code:'rate_limited' })
    now = start + 60000
    await expect(h.client.refresh()).rejects.toMatchObject({ code:'rate_limited' })
    now++
    expect((await h.client.refresh(100)).draft).toBe('')
    const emptyEnvelope = { channel_id:'c1',revision_id:'r1',request_id:'request-1',
      method:'write_demo_draft',payload:{ draft:'' } }
    const maxDraft = 8192 - new TextEncoder().encode(JSON.stringify(emptyEnvelope)).length
    expect(await h.client.saveDraft('x'.repeat(maxDraft))).toEqual({ saved:true,revision_id:'r1' })
    await expect(h.client.saveDraft('x'.repeat(maxDraft+1))).rejects.toMatchObject({ code:'message_too_large' })
    expect(h.host.record.draft).toHaveLength(maxDraft)
    } finally { hostClock.mockRestore() }
  })
  it('validates read timeouts and freezes reads when an old connection-level reply can arrive late', async () => {
    const h = harness()
    const ready = h.client.connect({ timeoutMs:100 }); h.init(); await tick()
    h.bridge.stateChanged(); await ready
    for (const timeout of [0,-1,1.5,60001,Number.NaN])
      await expect(h.client.refresh(timeout)).rejects.toMatchObject({ code:'invalid_timeout' })
    const held: unknown[] = []
    const original = h.a.postMessage.bind(h.a)
    h.a.postMessage = message => {
      if ((message as any).method === 'read_demo_state') held.push(message)
      else original(message)
    }
    await expect(h.client.refresh(5)).rejects.toMatchObject({ code:'read_timeout' })
    expect(held).toHaveLength(1)
    await expect(h.client.refresh()).rejects.toMatchObject({ code:'read_uncertain_reconnect_required' })
    h.b.onmessage?.({ data:held[0] } as MessageEvent)
    await expect(h.client.refresh()).rejects.toMatchObject({ code:'read_uncertain_reconnect_required' })
    const reset = h.client.reconnect()
    expect(reset.status()).toBe('waiting_init')
    await expect(reset.connect({ timeoutMs:5 })).rejects.toMatchObject({ code:'connect_timeout' })
  })
})
