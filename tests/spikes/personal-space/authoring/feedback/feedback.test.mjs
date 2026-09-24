import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthorWorkspace } from '../workspace/workspace.mjs'
import { makeRepairPacket, applyRepair } from './feedback.mjs'
import { developerRevision } from './model-v1-derivation.mjs'
import { readRevision } from '../../core/store.mjs'
import { validateAuthor } from '../validation/validate.mjs'

const root = path.resolve('reports/evidence/BATCH-013-R1/tmp')
const files = { 'view.html':'<p>Demo</p>', 'view.css':'p{}', 'view.js':'function () {' }
async function setup() {
  await fs.mkdir(root,{recursive:true})
  const store = new AuthorWorkspace(path.join(root,'feedback-'+randomUUID()))
  const workspace_id = 'repair-demo'
  await store.create({ workspace_id, format:'authoring-kit/1', files,
    source_type:'handwritten_fixture', origin:{ kind:'handwritten_fixture',reference:'repo_fixture' },
    requested_scopes:[] })
  await store.check(workspace_id)
  return { store,workspace_id }
}
describe('repair packet and real negative sample', () => {
  it('exports bounded current source and strictly applies new revision without inherited validation', async () => {
    const h = await setup()
    const packet = await makeRepairPacket(h.store,h.workspace_id)
    expect(packet.diagnostics_count).toBeGreaterThan(0)
    const result = await applyRepair(h.store,{ command:'apply-repair',workspace_id:h.workspace_id,
      packet:packet.packet_id,expected_head:packet.expected_head,source_hash:packet.source_hash,
      changes:{ 'view.js':'window.PersonalSpace.connect()' } })
    expect(result.previous_validation).toBe('invalidated')
    const read = await h.store.read(h.workspace_id)
    expect(read.receipts.current_check).toBeNull()
    expect(read.meta.source_type).toBe('handwritten_fixture')
    await expect(applyRepair(h.store,{ command:'apply-repair',workspace_id:h.workspace_id,
      packet:packet.packet_id,expected_head:packet.expected_head,source_hash:packet.source_hash,
      changes:{ 'view.css':'p{color:red}' } })).rejects.toMatchObject({ code:'stale_repair_packet' })
  })
  it('parses BATCH-012 model-v1 read-only, rejects original and statically checks developer revision', async () => {
    const old = await readRevision(path.resolve('reports/evidence/BATCH-012/model-store'),'model-v1')
    const negative = validateAuthor({ format:'authoring-kit/1',files:old.files })
    expect(negative.source_validation).toBe('failed')
    expect(negative.diagnostics.map(d=>d.code)).toContain('html_fragment_only')
    expect(negative.diagnostics.map(d=>d.code)).toContain('raw_bridge')
    const corrected = developerRevision(old.files)
    const validation = validateAuthor({ format:'authoring-kit/1',files:corrected })
    expect(validation.source_validation).toBe('passed')
    expect(corrected['view.js']).toContain('await window.PersonalSpace.saveDraft')
    expect(corrected['view.js']).not.toContain('port.postMessage')
  })
})
