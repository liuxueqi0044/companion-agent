import { describe, it, expect } from 'vitest'
import { StableHost, parseRecord } from './state'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
}
const hash = 'a'.repeat(64)
const candidate = (revision_id: string, base_revision: string | null = null) =>
  ({ revision_id, base_revision, artifact_hash:hash, source_type:'handwritten_fixture' as const })
const ready = (revision_id: string, base_revision: string | null, request_id: string) =>
  ({ revision_id, base_revision, artifact_hash:hash, request_id })
const host = (storage = new MemoryStorage()) => new StableHost(storage, 'test', new Set(['r1','r2','r3']))

describe('stable host', () => {
  it('keeps identity, draft and task binding through switch, undo and reload', async () => {
    const storage = new MemoryStorage(); const h = host(storage)
    h.writeDraft('line 1\nline 2')
    expect(await h.activate(candidate('r1'), id => Promise.resolve(ready('r1', null, id)))).toBe('active')
    const before = h.snapshot()
    expect(await h.activate(candidate('r2','r1'), id => Promise.resolve(ready('r2','r1',id)))).toBe('active')
    expect(await h.restorePrevious(candidate('r1','r2'), id => Promise.resolve(ready('r1','r2',id)))).toBe('restored')
    const reloaded = host(storage)
    expect(reloaded.record.active_revision).toBe('r1')
    expect(reloaded.record.draft).toBe('line 1\nline 2')
    expect(reloaded.record.personal_ai_id).toBe(before.personal_ai_id)
    expect(reloaded.record.session_id).toBe(before.session_id)
    expect(reloaded.record.tasks).toEqual(before.tasks)
  })
  it('keeps old active on bad ready, timeout, rejection, cancellation and stale base', async () => {
    const h = host()
    await h.activate(candidate('r1'), id => Promise.resolve(ready('r1',null,id)))
    expect(await h.activate(candidate('r2','r1'), id => Promise.resolve(ready('r2','r1','wrong')))).toBe('ready_mismatch')
    expect(await h.activate(candidate('r2','r1'), () => new Promise(() => {}), 5)).toBe('timeout')
    expect(await h.activate(candidate('r2','r1'), () => Promise.reject(new Error('failed')))).toBe('prepare_failed')
    let resolve!: (v: ReturnType<typeof ready>) => void
    const pending = h.activate(candidate('r2','r1'), () => new Promise(r => { resolve = r }))
    h.cancel(); resolve(ready('r2','r1','late'))
    expect(await pending).toBe('superseded')
    expect(await h.activate(candidate('r2',null), id => Promise.resolve(ready('r2',null,id)))).toBe('stale_base')
    expect(h.record.active_revision).toBe('r1')
  })
  it('newer candidate wins and model candidate never reaches prepare', async () => {
    const h = host()
    let older!: (v: ReturnType<typeof ready>) => void
    const p = h.activate(candidate('r1'), () => new Promise(r => { older = r }))
    expect(await h.activate(candidate('r2'), id => Promise.resolve(ready('r2',null,id)))).toBe('active')
    older(ready('r1',null,'old'))
    expect(await p).toBe('superseded')
    expect(h.record.active_revision).toBe('r2')
    const no = await h.activate({ ...candidate('r3','r2'), source_type:'model_candidate' },
      () => { throw new Error('must not prepare') })
    expect(no).toBe('untrusted_execution_unavailable')
  })
  it('rejects corrupt or oversized persistence and failed write does not mutate memory', () => {
    const storage = new MemoryStorage(); storage.setItem('test','{"schema":1,"extra":true}')
    const damaged = host(storage)
    expect(damaged.phase).toBe('recovery')
    expect(() => parseRecord('x'.repeat(21 * 1024))).toThrow()
    const failing = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    const h = new StableHost(failing, 'test')
    expect(() => h.writeDraft('test')).toThrow()
    expect(h.record.draft).toBe('')
  })
  it('keeps a running task bound to its original revision across visual replacement', async () => {
    const storage = new MemoryStorage()
    storage.setItem('test', JSON.stringify({ schema:1, personal_ai_id:'demo-personal-ai',
      session_id:'demo-session', draft:'work in progress',
      tasks:[{ id:'task-1', bound_revision:'r1', status:'running' }],
      active_revision:'r1', history:[] }))
    const h = host(storage)
    expect(await h.activate(candidate('r2','r1'), id => Promise.resolve(ready('r2','r1',id)))).toBe('active')
    expect(h.record.tasks[0]).toEqual({ id:'task-1', bound_revision:'r1', status:'running' })
    expect(h.record.draft).toBe('work in progress')
  })
})
