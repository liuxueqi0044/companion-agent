import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AuthorWorkspace, WorkspaceError } from './workspace.mjs'

export const PRODUCTION_ROOT = path.resolve(fileURLToPath(new URL('../../../../../reports/evidence/BATCH-013-R1/workspaces/', import.meta.url)))
const same = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const requireFields = (request, keys) => {
  if (!same(request, ['command', ...keys])) throw new WorkspaceError('invalid_request')
}

export async function execute(request, store = new AuthorWorkspace(PRODUCTION_ROOT)) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || typeof request.command !== 'string') throw new WorkspaceError('invalid_request')
  switch (request.command) {
    case 'create':
      requireFields(request,['workspace_id','format','files','source_type','origin','requested_scopes'])
      return store.create(Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'command')))
    case 'read': requireFields(request,['workspace_id']); return store.read(request.workspace_id)
    case 'change': requireFields(request,['workspace_id','expected_head','changes'])
      return store.change(request.workspace_id,request.expected_head,request.changes)
    case 'check': requireFields(request,['workspace_id']); return store.check(request.workspace_id)
    case 'build': requireFields(request,['workspace_id']); return store.build(request.workspace_id)
    case 'history': requireFields(request,['workspace_id']); return store.history(request.workspace_id)
    case 'restore': requireFields(request,['workspace_id','expected_head','target_revision'])
      return store.restore(request.workspace_id,request.expected_head,request.target_revision)
    case 'repair-packet': {
      requireFields(request,['workspace_id'])
      const { makeRepairPacket } = await import('../feedback/feedback.mjs')
      return makeRepairPacket(store, request.workspace_id)
    }
    case 'apply-repair': {
      requireFields(request,['workspace_id','packet','expected_head','source_hash','changes'])
      const { applyRepair } = await import('../feedback/feedback.mjs')
      return applyRepair(store,request)
    }
    default: throw new WorkspaceError('unknown_command')
  }
}

async function main() {
  const chunks = []
  let length = 0
  try {
    for await (const chunk of process.stdin) {
      length += chunk.length
      if (length > 128 * 1024) throw new WorkspaceError('input_too_large')
      chunks.push(chunk)
    }
    const text = new TextDecoder('utf-8', { fatal:true }).decode(Buffer.concat(chunks))
    const request = JSON.parse(text)
    const result = await execute(request)
    const output = JSON.stringify({ ok:true, result })
    if (Buffer.byteLength(output) > 128 * 1024) throw new WorkspaceError('output_too_large')
    process.stdout.write(output + '\n')
  } catch (cause) {
    const code = cause?.code || (cause instanceof SyntaxError ? 'invalid_json' : 'internal_error')
    process.stdout.write(JSON.stringify({ ok:false, error:{ code } }) + '\n')
    process.exitCode = code === 'internal_error' ? 3 : 2
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main()
