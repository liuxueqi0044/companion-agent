import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { FILES, PackageError, buildInputBytes, makeManifest, assemble, strictJson, sourceBytes } from './package.mjs'
import { stageSource, validateSource, sealCandidate, readRevision } from './store.mjs'

const spec = (revision_id, base_revision = null, changes = {
  'view.html': '<main>Hi\n there</main> ', 'view.css': 'body { color: red; }\r\n', 'view.js': 'window.test = 1\n',
}) => ({ package_id:'demo', revision_id, base_revision, host_api_version:'demo/1',
  source_type:'handwritten_fixture', requested_scopes:['read_demo_state'], changes })
const digest = b => createHash('sha256').update(b).digest('hex')
async function root() { return fs.mkdtemp(path.join(os.tmpdir(), 'personal-space-a-')) }

test('round trip preserves whitespace, independent hash and narrow incremental edit', async () => {
  const dir = await root()
  const first = await stageSource(dir, spec('r1'))
  assert.equal(first.manifest.build_input_hash, digest(buildInputBytes(spec('r1').changes)))
  assert.equal(first.manifest.files['view.css'].sha256, digest(Buffer.from('body { color: red; }\r\n')))
  assert.deepEqual((await validateSource(dir, 'r1')).valid, true)
  await sealCandidate(dir, 'r1')
  const read = await readRevision(dir, 'r1')
  assert.deepEqual(read.files, spec('r1').changes)
  const second = await stageSource(dir, spec('r2', 'r1', { 'view.js': 'window.test = 2\n' }))
  assert.equal(second.manifest.base_revision, 'r1')
  await sealCandidate(dir, 'r2')
  assert.equal((await readRevision(dir, 'r2')).files['view.html'], read.files['view.html'])
  assert.notEqual(second.manifest.build_input_hash, first.manifest.build_input_hash)
  await assert.rejects(stageSource(dir, spec('r1')), { code: 'EEXIST' })
})
test('strict invalid input, size, ID and unknown fields', () => {
  assert.throws(() => strictJson(Buffer.from([0xff])), { code:'invalid_utf8' })
  assert.throws(() => strictJson(Buffer.from('{oops')), { code:'invalid_json' })
  assert.throws(() => sourceBytes({ ...spec('x').changes, extra:'x' }), { code:'invalid_file_set' })
  assert.throws(() => sourceBytes({ ...spec('x').changes, 'view.js':'x'.repeat(32769) }), { code:'file_too_large' })
  assert.throws(() => sourceBytes({ 'view.html':'x'.repeat(32768), 'view.css':'x'.repeat(32768),
    'view.js':'x' }), { code:'source_too_large' })
  assert.throws(() => sourceBytes({ ...spec('x').changes, 'view.js':'\ud800' }),
    { code:'invalid_unicode_scalar' })
  assert.throws(() => makeManifest({ ...spec('../bad'), changes: undefined }), { code:'invalid_fields' })
  assert.throws(() => makeManifest({ package_id:'demo', revision_id:'../bad', base_revision:null,
    host_api_version:'demo/1', source_type:'handwritten_fixture', requested_scopes:[] }, spec('x').changes),
  { code:'invalid_id' })
})
test('tamper and real Windows junction rejected', async () => {
  const dir = await root()
  await stageSource(dir, spec('r1')); await sealCandidate(dir, 'r1')
  await fs.writeFile(path.join(dir, 'revisions', 'r1', 'view.js'), 'tampered')
  await assert.rejects(readRevision(dir, 'r1'), { code:'manifest_mismatch' })
  const safe = await root()
  await fs.mkdir(path.join(safe, 'outside'))
  await fs.symlink(path.join(safe, 'outside'), path.join(safe, 'candidates'), 'junction')
  await assert.rejects(stageSource(safe, spec('r2')), { code:'reparse_point' })
  assert.deepEqual(FILES, ['view.html','view.css','view.js'])
})
test('invalid stored UTF-8 and a different sealed revision collision fail', async () => {
  const dir = await root()
  await stageSource(dir, spec('r1')); await sealCandidate(dir, 'r1')
  const candidate = path.join(dir, 'candidates', 'r1')
  await fs.writeFile(path.join(candidate, 'view.html'), Buffer.from([0xff]))
  await assert.rejects(validateSource(dir, 'r1'), { code:'invalid_utf8' })
  const replacement = spec('r1', null, { ...spec('r1').changes, 'view.html':'another' })
  const manifest = makeManifest({ package_id:replacement.package_id, revision_id:replacement.revision_id,
    base_revision:null, host_api_version:replacement.host_api_version,
    source_type:replacement.source_type, requested_scopes:replacement.requested_scopes }, replacement.changes)
  await fs.writeFile(path.join(candidate, 'view.html'), replacement.changes['view.html'])
  await fs.writeFile(path.join(candidate, 'manifest.json'), JSON.stringify(manifest))
  await fs.writeFile(path.join(candidate, 'artifact.html'), assemble(replacement.changes))
  await assert.rejects(sealCandidate(dir, 'r1'), { code:'revision_collision' })
})
test('full manifest identity controls idempotent seal, with key order normalized', async () => {
  const dir = await root()
  const initial = { ...spec('r1'), requested_scopes:['write_demo_draft','read_demo_state'] }
  await stageSource(dir, initial); await sealCandidate(dir, 'r1')
  const sealedDir = path.join(dir, 'revisions', 'r1')
  const candidateDir = path.join(dir, 'candidates', 'r1')
  const original = await Promise.all([...FILES, 'artifact.html', 'manifest.json']
    .map(name => fs.readFile(path.join(sealedDir, name))))
  const variants = [
    { package_id:'another-package' },
    { base_revision:'another-base' },
    { source_type:'model_candidate' },
    { requested_scopes:['read_demo_state'] },
  ]
  for (const change of variants) {
    const fields = { package_id:'demo', revision_id:'r1', base_revision:null,
      host_api_version:'demo/1', source_type:'handwritten_fixture',
      requested_scopes:initial.requested_scopes, ...change }
    const manifest = makeManifest(fields, initial.changes)
    await fs.writeFile(path.join(candidateDir, 'manifest.json'), JSON.stringify(manifest))
    await assert.rejects(sealCandidate(dir, 'r1'), { code:'revision_collision' })
    const after = await Promise.all([...FILES, 'artifact.html', 'manifest.json']
      .map(name => fs.readFile(path.join(sealedDir, name))))
    for (let i = 0; i < original.length; i++) assert.deepEqual(after[i], original[i])
  }
  const same = makeManifest({ package_id:'demo', revision_id:'r1', base_revision:null,
    host_api_version:'demo/1', source_type:'handwritten_fixture',
    requested_scopes:initial.requested_scopes }, initial.changes)
  const reordered = Object.fromEntries(Object.entries(same).reverse())
  reordered.requested_scopes = [...same.requested_scopes].reverse()
  await fs.writeFile(path.join(candidateDir, 'manifest.json'), JSON.stringify(reordered))
  assert.equal((await sealCandidate(dir, 'r1')).already_sealed, true)
})
