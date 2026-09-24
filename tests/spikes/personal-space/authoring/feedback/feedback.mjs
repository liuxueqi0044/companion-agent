import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FILES, sha, sourceBytes } from '../../core/package.mjs'
import { validateAuthor, AUTHORING_VERSION } from '../validation/validate.mjs'
import { WorkspaceError } from '../workspace/workspace.mjs'

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const HASH = /^[a-f0-9]{64}$/
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const digest = value => sha(Buffer.from(JSON.stringify(value), 'utf8'))
const must = (condition, code) => { if (!condition) throw new WorkspaceError(code) }
const API = Object.freeze({ version:'space-client/1', methods:['connect','whenReady','snapshot','subscribe','refresh','saveDraft','dispose','reconnect'],
  example:'window.PersonalSpace.subscribe(state => { /* render state.draft and state.tasks */ }); window.PersonalSpace.connect().catch(showError); async function save(text) { await window.PersonalSpace.saveDraft(text); }' })

async function packetFolder(store, workspace) {
  const folder = await store.folder(workspace)
  const target = path.join(folder,'repair-packets')
  try { await fs.mkdir(target) } catch (cause) { if (cause.code !== 'EEXIST') throw cause }
  const real = await fs.realpath(target)
  must(path.normalize(real).toLowerCase() === path.normalize(target).toLowerCase(), 'reparse_point')
  return target
}
async function readPacket(store, workspace, packetId) {
  must(typeof packetId === 'string' && ID.test(packetId), 'invalid_packet_id')
  const file = path.join(await packetFolder(store,workspace),packetId+'.json')
  const stat = await fs.lstat(file)
  must(stat.isFile() && !stat.isSymbolicLink()
    && path.normalize(await fs.realpath(file)).toLowerCase() === path.normalize(file).toLowerCase()
    && stat.size <= 128*1024, 'invalid_packet')
  let packet
  try { packet = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(file))) }
  catch { throw new WorkspaceError('invalid_packet') }
  must(exact(packet,['format','packet_id','status','workspace_id','expected_head','head_revision',
    'source_hash','files','diagnostics','api','source_type','origin','integrity'])
    && packet.format === 'repair-packet/1' && packet.packet_id === packetId
    && packet.workspace_id === workspace && HASH.test(packet.expected_head)
    && HASH.test(packet.source_hash) && packet.status === 'for_future_agent'
    && packet.api.version === 'space-client/1'
    && digest(Object.fromEntries(Object.entries(packet).filter(([k]) => k !== 'integrity'))) === packet.integrity,
    'invalid_packet')
  sourceBytes(packet.files)
  return packet
}
export async function makeRepairPacket(store, workspace) {
  const current = await store.read(workspace)
  const validation = current.current_check_valid && current.receipts.current_check?.validation
    ? current.receipts.current_check.validation
    : validateAuthor({ format:AUTHORING_VERSION, files:current.files })
  const packet_id = 'p-' + randomUUID().replaceAll('-','')
  const body = { format:'repair-packet/1', packet_id, status:'for_future_agent',
    workspace_id:workspace, expected_head:current.head.integrity,
    head_revision:current.head.revision_id, source_hash:current.head.source_hash,
    files:Object.fromEntries(FILES.map(name => [name,current.files[name]])),
    diagnostics:validation.diagnostics.slice(0,20), api:API,
    source_type:current.meta.source_type, origin:current.meta.origin }
  const packet = { ...body, integrity:digest(body) }
  const bytes = Buffer.from(JSON.stringify(packet) + '\n','utf8')
  must(bytes.length <= 128*1024, 'packet_too_large')
  const file = path.join(await packetFolder(store,workspace),packet_id+'.json')
  const handle = await fs.open(file,'wx',0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  return { packet_id, status:packet.status, expected_head:body.expected_head,
    source_hash:body.source_hash, diagnostics_count:body.diagnostics.length,
    packet_hash:sha(bytes), bytes:bytes.length }
}
export async function applyRepair(store, request) {
  must(exact(request,['command','workspace_id','packet','expected_head','source_hash','changes'])
    && request.command === 'apply-repair', 'invalid_request')
  const packet = await readPacket(store,request.workspace_id,request.packet)
  must(request.expected_head === packet.expected_head && request.source_hash === packet.source_hash,
    'repair_base_mismatch')
  const current = await store.read(request.workspace_id)
  must(current.head.integrity === packet.expected_head
    && current.head.source_hash === packet.source_hash
    && current.meta.source_type === packet.source_type, 'stale_repair_packet')
  must(request.changes && typeof request.changes === 'object' && !Array.isArray(request.changes)
    && Object.keys(request.changes).length >= 1 && Object.keys(request.changes).length <= 3
    && Object.keys(request.changes).every(name => FILES.includes(name)), 'invalid_changes')
  sourceBytes({ ...current.files, ...request.changes })
  const changed = await store.change(request.workspace_id,packet.expected_head,request.changes)
  return { ...changed, source_type:packet.source_type, provenance:packet.origin,
    previous_validation:'invalidated', next:'check_then_build' }
}
