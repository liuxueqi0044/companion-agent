import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PackageError, FILES, id, exact, strictJson, utf8, sourceBytes, makeManifest, validateManifest, canonicalManifest, assemble, sha } from './package.mjs'

async function checked(part) {
  const stat = await fs.lstat(part)
  if (stat.isSymbolicLink()) throw new PackageError('reparse_point')
  const real = await fs.realpath(part)
  if (path.normalize(real).toLowerCase() !== path.normalize(part).toLowerCase())
    throw new PackageError('reparse_point')
  return stat
}
// Reject aliases on every existing segment, including the caller's root itself.
async function pathInside(root, segments, createParent = false) {
  if (!path.isAbsolute(root)) throw new PackageError('root_not_absolute')
  const fullRoot = path.resolve(root)
  const rootParts = []
  let cursor = path.parse(fullRoot).root
  rootParts.push(cursor)
  for (const segment of fullRoot.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment); rootParts.push(cursor)
  }
  for (const part of rootParts) await checked(part)
  let current = fullRoot
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!/^[A-Za-z0-9_.-]+$/.test(segment) || segment === '.' || segment === '..')
      throw new PackageError('path_traversal')
    current = path.join(current, segment)
    if (i < segments.length - 1 || !createParent) {
      try { await checked(current) }
      catch (error) {
        if (createParent && error?.code === 'ENOENT') {
          await fs.mkdir(current)
          await checked(current)
        } else throw error
      }
    } else {
      try { await checked(current) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    }
  }
  if (!current.startsWith(fullRoot + path.sep)) throw new PackageError('path_traversal')
  return current
}
async function writeNew(file, bytes) {
  const handle = await fs.open(file, 'wx', 0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}
async function readFixed(root, category, revision, expectedRevision = revision) {
  id(revision)
  const folder = await pathInside(root, [category, revision])
  const entries = (await fs.readdir(folder)).sort()
  if (entries.join('|') !== [...FILES, 'artifact.html', 'manifest.json'].sort().join('|'))
    throw new PackageError('invalid_package_entries')
  const files = {}
  for (const name of FILES) {
    const p = await pathInside(root, [category, revision, name])
    const bytes = await fs.readFile(p)
    files[name] = utf8(bytes)
  }
  sourceBytes(files)
  const manifestPath = await pathInside(root, [category, revision, 'manifest.json'])
  const manifest = strictJson(await fs.readFile(manifestPath))
  const artifactPath = await pathInside(root, [category, revision, 'artifact.html'])
  const artifact = await fs.readFile(artifactPath)
  validateManifest(manifest, files, artifact)
  if (manifest.revision_id !== expectedRevision) throw new PackageError('revision_mismatch')
  await checked(folder)
  return { manifest, files, artifact }
}
export async function readSource(root, revision, category = 'revisions') {
  if (!['candidates','revisions'].includes(category)) throw new PackageError('invalid_category')
  const { manifest, files } = await readFixed(root, category, revision)
  return { manifest, files }
}
export async function readRevision(root, revision) {
  const { manifest, files, artifact } = await readFixed(root, 'revisions', revision)
  return { manifest, files, artifact_hash: sha(artifact) }
}
export async function validateSource(root, revision) {
  const result = await readFixed(root, 'candidates', revision)
  return { valid: true, manifest: result.manifest, execution_validation: 'not_run' }
}
export async function stageSource(root, input) {
  exact(input, ['package_id','revision_id','base_revision','host_api_version','source_type','requested_scopes','changes'])
  id(input.revision_id)
  if (!path.isAbsolute(root)) throw new PackageError('root_not_absolute')
  await checked(path.resolve(root))
  let base = {}
  if (input.base_revision !== null) {
    const prior = await readRevision(root, input.base_revision)
    if (prior.manifest.package_id !== input.package_id) throw new PackageError('package_mismatch')
    base = prior.files
  }
  if (!input.changes || typeof input.changes !== 'object' || Array.isArray(input.changes)
      || !Object.keys(input.changes).length || Object.keys(input.changes).some(k => !FILES.includes(k)))
    throw new PackageError('invalid_changes')
  const files = { ...base, ...input.changes }
  const spec = { package_id: input.package_id, revision_id: input.revision_id,
    base_revision: input.base_revision, host_api_version: input.host_api_version,
    source_type: input.source_type, requested_scopes: input.requested_scopes }
  const manifest = makeManifest(spec, files)
  const folder = await pathInside(root, ['candidates', input.revision_id], true)
  await fs.mkdir(folder) // EEXIST means an existing candidate is never overwritten.
  for (const name of FILES) await writeNew(await pathInside(root, ['candidates', input.revision_id, name], true), Buffer.from(files[name], 'utf8'))
  await writeNew(await pathInside(root, ['candidates', input.revision_id, 'artifact.html'], true), assemble(files))
  await writeNew(await pathInside(root, ['candidates', input.revision_id, 'manifest.json'], true),
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'))
  return { manifest, execution_validation: 'not_run' }
}
export async function sealCandidate(root, revision) {
  const { manifest } = await readFixed(root, 'candidates', revision)
  const to = await pathInside(root, ['revisions', revision], true)
  try { await checked(to) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  if (await fs.stat(to).then(() => true, () => false)) {
    const existing = await readRevision(root, revision)
    if (canonicalManifest(existing.manifest) !== canonicalManifest(manifest))
      throw new PackageError('revision_collision')
    return { manifest: existing.manifest, already_sealed: true }
  }
  const temporary = 'tmp-' + randomUUID()
  const tempDir = await pathInside(root, ['revisions', temporary], true)
  await fs.mkdir(tempDir)
  // Prepare a complete sibling directory, then publish it in one same-volume rename.
  try {
    for (const name of [...FILES, 'artifact.html', 'manifest.json']) {
      const src = await pathInside(root, ['candidates', revision, name])
      const dst = await pathInside(root, ['revisions', temporary, name], true)
      await fs.copyFile(src, dst, 1) // COPYFILE_EXCL
    }
    await readFixed(root, 'revisions', temporary, revision)
    await fs.rename(tempDir, to)
    await readRevision(root, revision)
    return { manifest, already_sealed: false }
  } catch (error) { throw error }
}
