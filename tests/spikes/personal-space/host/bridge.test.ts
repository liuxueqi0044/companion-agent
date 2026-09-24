import { describe, it, expect } from 'vitest'
import { BoundBridge } from './bridge'
import { StableHost, seedRecord } from './state'

class Port {
  sent: unknown[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  closeCount = 0
  postMessage(value: unknown) { this.sent.push(value) }
  close() { this.closeCount++ }
}
const binding = { channel_id:'channel', revision_id:'r1', request_id:'request', artifact_hash:'a'.repeat(64), base_revision:null }
const message = (method: string, payload: object = {}) => ({ channel_id:'channel', revision_id:'r1', request_id:'request', method, payload })
function setup(grants = new Set(['read_demo_state','write_demo_draft'])) {
  const port = new Port()
  const state = seedRecord(); state.active_revision = 'r1'
  const memory = { getItem: () => JSON.stringify(state), setItem: () => {} }
  const host = new StableHost(memory)
  const bridge = new BoundBridge(port, binding, host, grants)
  return { bridge, port, host }
}
describe('bound port', () => {
  it('requires exact channel, revision, request, ready and grant', () => {
    const { bridge, host, port } = setup(new Set(['read_demo_state']))
    expect(bridge.receive(message('read_demo_state'))).toBe('not_ready')
    expect(bridge.receive({ ...message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }), channel_id:'other' })).toBe('invalid_envelope')
    expect(bridge.receive({ ...message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }), revision_id:'r2' })).toBe('invalid_envelope')
    expect(bridge.receive(message('ready', { artifact_hash:'wrong', base_revision:null }))).toBe('ready_invalid')
    expect(bridge.receive(message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }))).toBe('ready')
    expect(bridge.receive(message('write_demo_draft', { draft:'forged' }))).toBe('denied')
    expect(bridge.receive(message('complete_task', { status:'completed' }))).toBe('method_denied')
    expect(bridge.receive(message('read_demo_state'))).toBe('read_demo_state')
    expect(host.record.draft).toBe('')
    expect(host.record.tasks[0].status).toBe('unavailable')
    expect(port.sent).toHaveLength(1)
  })
  it('rejects oversized and flood messages and unknown fields', () => {
    const { bridge } = setup()
    expect(bridge.receive(message('write_demo_draft', { draft:'x'.repeat(9000) }))).toBe('invalid_envelope')
    expect(bridge.receive({ ...message('ready'), extra:true })).toBe('invalid_envelope')
    expect(bridge.receive(message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }))).toBe('ready')
    for (let i = 0; i < 29; i++) bridge.receive(message('read_demo_state'))
    expect(bridge.receive(message('read_demo_state'))).toBe('rate_limited')
  })
  it('outbound state requires ready, active connection and current read grant', () => {
    const grants = new Set(['write_demo_draft'])
    const { bridge, port, host } = setup(grants)
    host.writeDraft('private draft')
    expect(bridge.stateChanged()).toBe(false)
    expect(port.sent).toHaveLength(0)
    expect(bridge.receive(message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }))).toBe('ready')
    expect(bridge.stateChanged()).toBe(false) // write-only is not read permission
    grants.add('read_demo_state')
    expect(bridge.stateChanged()).toBe(true)
    expect(port.sent).toHaveLength(1)
    expect(JSON.stringify(port.sent[0])).toContain('private draft')
    expect(JSON.stringify(port.sent[0])).not.toContain('personal_ai_id')
    grants.delete('read_demo_state')
    expect(bridge.stateChanged()).toBe(false)
    expect(bridge.receive(message('read_demo_state'))).toBe('denied')
    expect(port.sent).toHaveLength(1)
    host.record.active_revision = 'r2'
    grants.add('read_demo_state')
    expect(bridge.stateChanged()).toBe(false)
    expect(port.sent).toHaveLength(1)
    bridge.close(); bridge.close()
    expect(port.closeCount).toBe(1)
    expect(bridge.receive(message('write_demo_draft', { draft:'forged' }))).toBe('closed')
    expect(bridge.stateChanged()).toBe(false)
    expect(host.record.draft).toBe('private draft')
    expect(port.sent).toHaveLength(1)
  })
  it('old same-revision connection loses access after a new connection becomes active', () => {
    const state = seedRecord(); state.active_revision = 'r1'; state.draft = 'demo only'
    const host = new StableHost({ getItem:() => JSON.stringify(state), setItem:() => {} })
    const grants = new Set(['read_demo_state'])
    const oldPort = new Port(), newPort = new Port()
    let active: BoundBridge
    const old: BoundBridge = new BoundBridge(oldPort, binding, host, grants, (): boolean => active === old)
    const newer: BoundBridge = new BoundBridge(newPort, { ...binding, channel_id:'new-channel' }, host, grants,
      (): boolean => active === newer)
    active = old
    old.receive(message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }))
    expect(old.stateChanged()).toBe(true)
    active = newer
    newer.receive({ ...message('ready', { artifact_hash:binding.artifact_hash, base_revision:null }),
      channel_id:'new-channel' })
    expect(old.stateChanged()).toBe(false)
    expect(old.receive(message('read_demo_state'))).toBe('not_active')
    expect(newer.stateChanged()).toBe(true)
    expect(oldPort.sent).toHaveLength(1)
    expect(newPort.sent).toHaveLength(1)
  })
})
