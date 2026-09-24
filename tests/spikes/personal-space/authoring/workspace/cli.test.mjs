import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('./cli.mjs',import.meta.url))
const call = request => {
  const result = spawnSync(process.execPath,[cli],{input:JSON.stringify(request),encoding:'utf8',timeout:10000})
  return { exit:result.status, reply:JSON.parse(result.stdout.trim()), stderr:result.stderr }
}
describe('actual fixed-root JSON CLI', () => {
  it('runs create/read/check/build/history and rejects root override', () => {
    const workspace_id = 'cli-' + randomUUID().replaceAll('-','')
    const create = call({command:'create',workspace_id,format:'authoring-kit/1',
      files:{'view.html':'<p>CLI fixture</p>','view.css':'p{}',
        'view.js':'window.PersonalSpace.connect()'},
      source_type:'handwritten_fixture',origin:{kind:'handwritten_fixture',reference:'repo_fixture:cli'},
      requested_scopes:[]})
    expect(create.exit).toBe(0)
    expect(create.reply.result.head.revision_id).toMatch(/^a-/)
    expect(call({command:'check',workspace_id}).reply.result.validation.source_validation).toBe('passed')
    const build = call({command:'build',workspace_id})
    expect(build.exit).toBe(0)
    expect(build.reply.result.status).toBe('built')
    expect(call({command:'history',workspace_id}).reply.result.revisions).toHaveLength(1)
    expect(call({command:'read',workspace_id,root:'C:\\'}).reply.error.code).toBe('invalid_request')
    expect(call({command:'unknown'}).exit).toBe(2)
  })
})
