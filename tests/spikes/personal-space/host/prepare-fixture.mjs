import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILES, makeManifest, assemble } from '../core/package.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, 'fixture')
const files = Object.fromEntries(await Promise.all(FILES.map(async name =>
  [name, await fs.readFile(path.join(dir, name), 'utf8')])))
const manifest = makeManifest({ package_id:'handwritten-demo', revision_id:'fixture-v1', base_revision:null,
  host_api_version:'demo/1', source_type:'handwritten_fixture',
  requested_scopes:['read_demo_state','write_demo_draft'] }, files)
await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await fs.writeFile(path.join(dir, 'artifact.html'), assemble(files))
process.stdout.write(JSON.stringify({ artifact_hash:manifest.artifact_hash, build_input_hash:manifest.build_input_hash }) + '\n')
