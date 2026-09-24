import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthorWorkspace } from './workspace/workspace.mjs'
import { sha } from '../core/package.mjs'

const root = path.resolve('reports/evidence/BATCH-013-R1/tmp')
async function setup() {
  await fs.mkdir(root,{recursive:true})
  const store = new AuthorWorkspace(path.join(root,'fault-'+randomUUID()))
  const workspace = 'fault-space'
  await store.create({workspace_id:workspace,format:'authoring-kit/1',source_type:'handwritten_fixture',
    origin:{kind:'handwritten_fixture',reference:'repo_fixture'},requested_scopes:[],
    files:{'view.html':'<p>Demo</p>','view.css':'p{}','view.js':'window.PersonalSpace.connect()'}})
  return {store,workspace}
}
const gate = () => { let release; const wait = new Promise(resolve=>{release=resolve}); return {wait,release} }
describe('workspace failure boundaries', () => {
  it('rejects stale check/build publication after a concurrent source edit', async () => {
    for (const command of ['check','build']) {
      const h = await setup()
      const entered = gate(), continueWork = gate()
      const original = h.store.publishReceipt.bind(h.store)
      h.store.publishReceipt = async (...args) => {
        entered.release(); await continueWork.wait; return original(...args)
      }
      const pending = h.store[command](h.workspace)
      await entered.wait
      const current = await h.store.read(h.workspace)
      await h.store.change(h.workspace,current.head.integrity,{'view.css':'p{color:blue}'})
      continueWork.release()
      await expect(pending).rejects.toMatchObject({code:'stale_head'})
      expect((await h.store.read(h.workspace)).receipts.current_build).toBeNull()
    }
  })
  it('keeps head at old complete revision on injected publish failure', async () => {
    const h = await setup()
    const original = (await h.store.read(h.workspace)).head
    h.store.commitHead = async () => { throw new Error('injected_write_failure') }
    await expect(h.store.change(h.workspace,original.integrity,{'view.css':'p{color:red}'}))
      .rejects.toThrow('injected_write_failure')
    const reopened = await new AuthorWorkspace(h.store.root).read(h.workspace)
    expect(reopened.head).toEqual(original)
    expect(reopened.files['view.css']).toBe('p{}')
  })
  it('marks a genuine old tool receipt stale and rejects forged SDK/artifact linkage', async () => {
    const old = await new AuthorWorkspace(path.resolve('reports/evidence/BATCH-013/workspaces'))
      .read('model-v1-derivative')
    expect(old.current_build_valid).toBe(false)
    const h = await setup()
    const first = await h.store.build(h.workspace)
    const file = path.join(h.store.root,h.workspace,'receipts',first.receipt.id+'.json')
    const parsed = JSON.parse(await fs.readFile(file,'utf8'))
    const {integrity, ...body} = parsed
    body.sdk_hash = 'f'.repeat(64)
    await fs.writeFile(file,JSON.stringify({...body,integrity:sha(Buffer.from(JSON.stringify(body)))})+'\n')
    await expect(h.store.read(h.workspace)).rejects.toMatchObject({code:'recovery_required'})
    const next = await setup()
    const rebuilt = await next.store.build(next.workspace)
    const latestFile = path.join(next.store.root,next.workspace,'receipts',rebuilt.receipt.id+'.json')
    const latest = JSON.parse(await fs.readFile(latestFile,'utf8'))
    const {integrity:oldIntegrity, ...bad} = latest
    bad.artifact_hash = '0'.repeat(64)
    await fs.writeFile(latestFile,JSON.stringify({...bad,integrity:sha(Buffer.from(JSON.stringify(bad)))})+'\n')
    await expect(next.store.read(next.workspace)).rejects.toMatchObject({code:'recovery_required'})
  })
})
