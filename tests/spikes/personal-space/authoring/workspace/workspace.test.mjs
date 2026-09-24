import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthorWorkspace } from './workspace.mjs'
import { execute } from './cli.mjs'
import { sha } from '../../core/package.mjs'

const evidence = path.resolve('reports/evidence/BATCH-013-R1/tmp')
const files = () => ({ 'view.html':'<main id="status">Demo</main>', 'view.css':'main{color:#222}',
  'view.js':'window.PersonalSpace.connect().then(() => { document.querySelector("#status").textContent = "Ready" })' })
async function setup() {
  await fs.mkdir(evidence, { recursive:true })
  const root = path.join(evidence,'case-' + randomUUID())
  const store = new AuthorWorkspace(root)
  const workspace_id = 'test-space'
  const created = await store.create({ workspace_id, format:'authoring-kit/1', files:files(),
    source_type:'handwritten_fixture', origin:{ kind:'handwritten_fixture',reference:'repo_fixture' },
    requested_scopes:['read_demo_state','write_demo_draft'] })
  return { root, store, workspace_id, created }
}
async function rewriteSealed(file, change) {
  const before = JSON.parse(await fs.readFile(file,'utf8'))
  const { integrity, ...body } = before
  change(body)
  await fs.writeFile(file,JSON.stringify({...body,integrity:sha(Buffer.from(JSON.stringify(body)))})+'\n')
}

describe('versioned author workspace', () => {
  it('creates, checks, builds, changes one file, retains old build and restores source', async () => {
    const h = await setup()
    const first = h.created.head
    expect(h.created.files).toEqual(files())
    const check = await h.store.check(h.workspace_id)
    expect(check.validation.source_validation).toBe('passed')
    const build = await h.store.build(h.workspace_id)
    expect(build.status).toBe('built')
    const afterBuild = await h.store.read(h.workspace_id)
    expect(afterBuild.current_build_valid).toBe(true)
    expect(afterBuild.receipts.current_build.author_source_hash).toBe(first.source_hash)
    const changed = await h.store.change(h.workspace_id,afterBuild.head.integrity,
      { 'view.css':'main{color:purple}' })
    expect(changed.source_hash).not.toBe(first.source_hash)
    const now = await h.store.read(h.workspace_id)
    expect(now.files['view.js']).toBe(files()['view.js'])
    expect(now.receipts.current_build).toBeNull()
    expect(now.receipts.last_good_build.id).toBe(build.receipt.id)
    expect(now.current_build_valid).toBe(false)
    const restored = await h.store.restore(h.workspace_id,now.head.integrity,first.revision_id)
    expect(restored.source_hash).toBe(first.source_hash)
    const history = await h.store.history(h.workspace_id)
    expect(history.revisions).toHaveLength(2)
    expect(history.operations.map(x => x.operation)).toEqual(['restore','change','create'])
    const afterRestore = await h.store.read(h.workspace_id)
    expect(afterRestore.files).toEqual(files())
    expect(afterRestore.receipts.current_check).toBeNull()
    expect(afterRestore.receipts.current_build).toBeNull()
    expect(afterRestore.receipts.last_good_build.id).toBe(build.receipt.id)
    expect(afterRestore.current_build_valid).toBe(false)
    expect((await h.store.check(h.workspace_id)).validation.source_validation).toBe('passed')
    const rebuilt = await h.store.build(h.workspace_id)
    expect(rebuilt.status).toBe('built')
    expect(rebuilt.receipt.id).not.toBe(build.receipt.id)
    expect((await h.store.read(h.workspace_id)).current_build_valid).toBe(true)
  })
  it('serializes racing CAS changes; old head and old check cannot overwrite', async () => {
    const h = await setup()
    const token = h.created.head.integrity
    const results = await Promise.allSettled([
      h.store.change(h.workspace_id,token,{ 'view.css':'main{color:red}' }),
      h.store.change(h.workspace_id,token,{ 'view.css':'main{color:blue}' }),
    ])
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(x => x.status === 'rejected')[0].reason.code).toBe('conflict')
    await expect(h.store.change(h.workspace_id,token,{ 'view.css':'x{}' })).rejects.toMatchObject({ code:'conflict' })
    const current = await h.store.read(h.workspace_id)
    expect(['main{color:red}','main{color:blue}']).toContain(current.files['view.css'])
  })
  it('holds last good build on validation failure, rejects bad source and damaged head', async () => {
    const h = await setup()
    const built = await h.store.build(h.workspace_id)
    const current = await h.store.read(h.workspace_id)
    await h.store.change(h.workspace_id,current.head.integrity,{ 'view.js':'function () {' })
    const failed = await h.store.build(h.workspace_id)
    expect(failed.status).toBe('failed')
    expect(failed.validation.diagnostics.map(d => d.code)).toContain('js_parse')
    expect((await h.store.read(h.workspace_id)).head.last_good_build).toBe(built.receipt.id)
    await fs.writeFile(path.join(h.root,h.workspace_id,'head.json'),'{}')
    await expect(h.store.read(h.workspace_id)).rejects.toMatchObject({ code:'recovery_required' })
  })
  it('exposes a narrow JSON command executor and refuses unknown fields/commands', async () => {
    const h = await setup()
    const read = await execute({ command:'read', workspace_id:h.workspace_id },h.store)
    expect(read.head.revision_id).toBe(h.created.head.revision_id)
    await expect(execute({ command:'read', workspace_id:h.workspace_id, root:'C:\\' },h.store))
      .rejects.toMatchObject({ code:'invalid_request' })
    await expect(execute({ command:'shell', workspace_id:h.workspace_id },h.store))
      .rejects.toMatchObject({ code:'unknown_command' })
  })
  it('rejects a failed check in either build pointer while preserving the damaged head for recovery', async () => {
    for (const pointer of ['current_build','last_good_build']) {
      const h = await setup()
      const good = await h.store.build(h.workspace_id)
      await h.store.change(h.workspace_id,(await h.store.read(h.workspace_id)).head.integrity,
        {'view.js':'function () {'})
      const failed = await h.store.build(h.workspace_id)
      expect(failed.receipt.kind).toBe('check')
      const headFile = path.join(h.root,h.workspace_id,'head.json')
      await rewriteSealed(headFile,head => { head[pointer] = failed.receipt.id })
      const damaged = await fs.readFile(headFile)
      await expect(h.store.read(h.workspace_id)).rejects.toMatchObject({code:'recovery_required'})
      expect(await fs.readFile(headFile)).toEqual(damaged)
      expect(good.receipt.kind).toBe('build')
    }
    const h = await setup()
    const good = await h.store.build(h.workspace_id)
    const headFile = path.join(h.root,h.workspace_id,'head.json')
    await rewriteSealed(headFile,head => { head.current_check = good.receipt.id })
    await expect(h.store.read(h.workspace_id)).rejects.toMatchObject({code:'recovery_required'})
  })
  it('keeps failed current check and old valid build distinct; old tool receipts are readable but stale', async () => {
    const h = await setup()
    const good = await h.store.build(h.workspace_id)
    await h.store.change(h.workspace_id,(await h.store.read(h.workspace_id)).head.integrity,
      {'view.js':'const count: number = 1;'})
    const failed = await h.store.build(h.workspace_id)
    expect(failed.status).toBe('failed')
    const read = await h.store.read(h.workspace_id)
    expect(read.receipts.current_check.kind).toBe('check')
    expect(read.current_check_valid).toBe(true)
    expect(read.current_check_passed).toBe(false)
    expect(read.receipts.current_build).toBeNull()
    expect(read.receipts.last_good_build.id).toBe(good.receipt.id)
    expect(read.current_build_valid).toBe(false)
    const frozen = await new AuthorWorkspace(path.resolve('reports/evidence/BATCH-013/workspaces'))
      .read('model-v1-derivative')
    expect(frozen.meta.source_type).toBe('model_candidate')
    expect(frozen.receipts.current_build.kind).toBe('build')
    expect(frozen.current_build_valid).toBe(false)
  })
  it('rejects receipt lineage, grant and effective-source contradictions even with recalculated integrity', async () => {
    for (const mutate of [
      body => { body.source_type = 'model_candidate' },
      body => { body.requested_scopes = [] },
      body => { body.validation.source_validation = 'failed'; body.validation_report_hash = sha(Buffer.from(JSON.stringify(body.validation))) },
    ]) {
      const h = await setup()
      const built = await h.store.build(h.workspace_id)
      const receiptFile = path.join(h.root,h.workspace_id,'receipts',built.receipt.id+'.json')
      await rewriteSealed(receiptFile,mutate)
      await expect(h.store.read(h.workspace_id)).rejects.toMatchObject({code:'recovery_required'})
    }
  })
  it('bounds damaged JSON before read and treats missing referenced receipt as recovery required', async () => {
    const h = await setup()
    await h.store.check(h.workspace_id)
    const head = (await h.store.read(h.workspace_id)).head
    const receiptFile = path.join(h.root,h.workspace_id,'receipts',head.current_check+'.json')
    await fs.writeFile(receiptFile,'x'.repeat(128*1024+1))
    await expect(h.store.read(h.workspace_id)).rejects.toMatchObject({code:'recovery_required'})
    const second = await setup()
    const checked = await second.store.check(second.workspace_id)
    await fs.unlink(path.join(second.root,second.workspace_id,'receipts',checked.receipt.id+'.json'))
    await expect(second.store.read(second.workspace_id)).rejects.toMatchObject({code:'recovery_required'})
  })
})
