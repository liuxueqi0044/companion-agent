import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILES, makeManifest, assemble } from '../../core/package.mjs'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'v2')
const files = Object.fromEntries(await Promise.all(FILES.map(async name =>
  [name, await fs.readFile(path.join(dir, name), 'utf8')])))
const manifest = makeManifest({ package_id:'handwritten-demo', revision_id:'fixture-v2',
  base_revision:'fixture-v1', host_api_version:'demo/1', source_type:'handwritten_fixture',
  requested_scopes:['read_demo_state','write_demo_draft'] }, files)
await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await fs.writeFile(path.join(dir, 'artifact.html'), assemble(files))
process.stdout.write(JSON.stringify({ artifact_hash:manifest.artifact_hash }) + '\n')
