import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { AuthorWorkspace } from './workspace/workspace.mjs'
import { StableHost, seedRecord } from '../host/state.ts'
import { MountCoordinator } from '../host/mount.ts'
import { sha } from '../core/package.mjs'

const evidence = path.resolve('reports/evidence/BATCH-013-R1/tmp')
async function fixtureFiles() {
  const folder = path.resolve('tests/spikes/personal-space/authoring/fixtures/plain')
  return Object.fromEntries(await Promise.all(['view.html','view.css','view.js']
    .map(async name => [name,await fs.readFile(path.join(folder,name),'utf8')])))
}
async function workspace() {
  await fs.mkdir(evidence,{recursive:true})
  const store = new AuthorWorkspace(path.join(evidence,'integrated-'+randomUUID()))
  const workspace_id = 'trusted-fixture'
  const created = await store.create({ workspace_id,format:'authoring-kit/1',files:await fixtureFiles(),
    source_type:'handwritten_fixture',origin:{ kind:'handwritten_fixture',reference:'repo_fixture:plain' },
    requested_scopes:['read_demo_state','write_demo_draft'] })
  return { store, workspace_id, created }
}
class Port {
  peer = null; onmessage = null; onmessageerror = null; closed = false; sent = []
  postMessage(message) {
    this.sent.push(message)
    if (!this.closed) queueMicrotask(() => { if (!this.peer?.closed) this.peer?.onmessage?.({ data:message }) })
  }
  close() { this.closed = true }
}
const spin = async condition => {
  for (let i=0; i<100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve,1)) }
  throw new Error('condition_timeout')
}
async function bundle(h,built) {
  const folder = path.join(h.store.root,h.workspace_id,'effective-store','revisions',built.receipt.effective_revision)
  const artifact = await fs.readFile(path.join(folder,'artifact.html'),'utf8')
  const script = await fs.readFile(path.join(folder,'view.js'),'utf8')
  expect(sha(Buffer.from(artifact))).toBe(built.receipt.artifact_hash)
  return { revision_id:built.receipt.effective_revision, artifact,script,
    artifact_hash:built.receipt.artifact_hash,expected_hash:built.receipt.artifact_hash,
    source_type:'handwritten_fixture',host_api_version:'demo/1' }
}
function hostHarness(fixtures) {
  const dom = new JSDOM('<div id="slot"></div>',{url:'http://localhost',runScripts:'outside-only'})
  Object.assign(globalThis,{ window:dom.window,document:dom.window.document,Event:dom.window.Event })
  const memory = { value:null, getItem() { return this.value }, setItem(_key,value) { this.value=value } }
  const host = new StableHost(memory,'authoring-integration',new Set([...fixtures.keys()]))
  const frames = [], channels = [], statuses = []
  const mount = new MountCoordinator(host,dom.window.document.getElementById('slot'),fixtures,
    new Set(['read_demo_state','write_demo_draft']),value=>statuses.push(value),{
      hashArtifact:async artifact=>sha(Buffer.from(artifact)),
      createFrame:artifact=> {
        const frame = dom.window.document.createElement('iframe')
        frame.srcdoc=artifact; frames.push(frame)
        return frame
      },
      createChannel:()=> {
        const a=new Port(),b=new Port(); a.peer=b;b.peer=a
        channels.push({a,b}); return { port1:a,port2:b }
      },
      sendInit:(source,payload,port)=> {
        const item = fixtures.get(payload.revision_id)
        source.document.open()
        source.document.write(item.artifact)
        source.document.close()
        source.TextEncoder = TextEncoder
        source.eval(item.script) // Only the fixed registered repo fixture; model descendants never reach this path.
        source.dispatchEvent(new source.MessageEvent('message', { data:payload,
          source:source.parent,ports:[port] }))
      },
      timeoutMs:500,
    })
  async function load(index) {
    await spin(()=>frames.length>index)
    frames[index].dispatchEvent(new dom.window.Event('load'))
  }
  return { dom,host,mount,frames,channels,statuses,load,memory }
}

describe('trusted authoring fixture through actual host modules', () => {
  it('create/edit/check/build, mount, save, switch, undo and stable draft', async () => {
    const h = await workspace()
    expect((await h.store.check(h.workspace_id)).validation.source_validation).toBe('passed')
    const firstBuild = await h.store.build(h.workspace_id)
    const first = await bundle(h,firstBuild)
    const changed = await h.store.change(h.workspace_id,(await h.store.read(h.workspace_id)).head.integrity,
      { 'view.css':'main{font:14px sans-serif;padding:12px} label,textarea,output{display:block}' })
    expect(changed.source_hash).not.toBe(h.created.head.source_hash)
    expect((await h.store.check(h.workspace_id)).validation.source_validation).toBe('passed')
    const secondBuild = await h.store.build(h.workspace_id)
    const second = await bundle(h,secondBuild)
    const fixtures = new Map([[first.revision_id,first],[second.revision_id,second]])
    const runtime = hostHarness(fixtures)
    const initial = runtime.mount.activate(first.revision_id)
    await runtime.load(0)
    expect(await initial).toBe('active')
    await spin(()=>runtime.frames[0].contentWindow.PersonalSpace?.status()==='active')
    const firstFrame = runtime.mount.activeFrame
    const child = firstFrame.contentWindow
    child.document.getElementById('draft').value='Stable draft'
    child.document.getElementById('save').click()
    await spin(()=>child.document.getElementById('status').textContent==='Saved')
    expect(runtime.host.record.draft).toBe('Stable draft')
    const next = runtime.mount.activate(second.revision_id)
    await runtime.load(1)
    expect(await next).toBe('active')
    await spin(()=>runtime.frames[1].contentWindow.PersonalSpace?.status()==='active')
    expect(runtime.mount.activeFrame).not.toBe(firstFrame)
    expect(runtime.frames[1].contentWindow.document.getElementById('draft').value).toBe('Stable draft')
    expect(runtime.channels[0].a.closed).toBe(true)
    const undo = runtime.mount.undo(); await runtime.load(2)
    expect(await undo).toBe('restored')
    expect(runtime.host.record.active_revision).toBe(first.revision_id)
    expect(runtime.host.record.draft).toBe('Stable draft')
    expect(runtime.mount.activeRevision).toBe(first.revision_id)
    expect(runtime.dom.window.document.querySelectorAll('iframe')).toHaveLength(1)
    expect((await new AuthorWorkspace(h.store.root).read(h.workspace_id)).head.revision_id).toBe(changed.head.revision_id)
  })
  it('rejects model lineage before frame creation', async () => {
    const built = { revision_id:'model-v1',artifact:'<p>model</p>',artifact_hash:'a'.repeat(64),
      expected_hash:'a'.repeat(64),source_type:'model_candidate',host_api_version:'demo/1' }
    const runtime = hostHarness(new Map([['model-v1',built]]))
    expect(await runtime.mount.activate('model-v1')).toBe('fixture_unavailable')
    expect(runtime.frames).toHaveLength(0)
    expect(runtime.host.record.active_revision).toBeNull()
  })
  it('recovers an ACK-unknown save through the real host with a new channel and fresh read', async () => {
    const h = await workspace()
    expect((await h.store.check(h.workspace_id)).validation.source_validation).toBe('passed')
    const built = await h.store.build(h.workspace_id)
    const fixed = await bundle(h,built)
    const runtime = hostHarness(new Map([[fixed.revision_id,fixed]]))
    const initial = runtime.mount.activate(fixed.revision_id)
    await runtime.load(0)
    expect(await initial).toBe('active')
    await spin(()=>runtime.frames[0].contentWindow.PersonalSpace?.status()==='active')
    const firstClient = runtime.frames[0].contentWindow.PersonalSpace
    let writes = 0
    const writeDraft = runtime.host.writeDraft.bind(runtime.host)
    runtime.host.writeDraft = draft => { writes++; return writeDraft(draft) }
    const lateAcks = []
    const firstPort = runtime.channels[0].a
    const firstPost = firstPort.postMessage.bind(firstPort)
    firstPort.postMessage = message => {
      if (message.method === 'write_demo_draft') lateAcks.push(message)
      else firstPost(message)
    }
    await expect(firstClient.saveDraft('Saved without known ACK',5))
      .rejects.toMatchObject({ code:'save_timeout' })
    expect(runtime.host.record.draft).toBe('Saved without known ACK')
    expect(writes).toBe(1)
    await expect(firstClient.saveDraft('duplicate')).rejects
      .toMatchObject({ code:'write_uncertain_reconnect_required' })
    expect(lateAcks).toHaveLength(1)
    const resetOnly = firstClient.reconnect()
    expect(resetOnly.status()).toBe('waiting_init')
    await expect(resetOnly.connect({ timeoutMs:5 })).rejects.toMatchObject({ code:'connect_timeout' })
    expect(runtime.frames).toHaveLength(1)

    const recovery = runtime.mount.recover()
    await runtime.load(1)
    expect(await recovery).toBe('recovered')
    await spin(()=>runtime.frames[1].contentWindow.PersonalSpace?.status()==='active')
    const secondClient = runtime.frames[1].contentWindow.PersonalSpace
    expect(secondClient.binding().channel_id).not.toBe(firstClient.binding().channel_id)
    expect((await secondClient.refresh()).draft).toBe('Saved without known ACK')
    expect(runtime.host.record.draft).toBe('Saved without known ACK')
    expect(writes).toBe(1)
    expect(firstPort.closed).toBe(true)
    const secondAcks = []
    const secondPort = runtime.channels[1].a
    const secondPost = secondPort.postMessage.bind(secondPort)
    secondPort.postMessage = message => {
      if (message.method === 'write_demo_draft') secondAcks.push(message)
      else secondPost(message)
    }
    let acknowledged = false
    const secondSave = secondClient.saveDraft('Saved again',100).then(value => {
      acknowledged = true; return value
    })
    runtime.channels[1].b.onmessage?.({ data:lateAcks[0] })
    await new Promise(resolve=>queueMicrotask(resolve))
    expect(acknowledged).toBe(false)
    expect(secondAcks).toHaveLength(1)
    runtime.channels[1].b.onmessage?.({ data:secondAcks[0] })
    expect(await secondSave).toEqual({ saved:true, revision_id:fixed.revision_id })
    expect(runtime.host.record.draft).toBe('Saved again')
    expect(writes).toBe(2)
    expect(runtime.dom.window.document.querySelectorAll('iframe')).toHaveLength(1)
  })
})
