import { createHash } from 'node:crypto'

export const FORMAT = 'personal-space-spike/1'
export const HOST_API_VERSION = 'demo/1'
export const FILES = Object.freeze(['view.html', 'view.css', 'view.js'])
export const SCOPES = Object.freeze(['read_demo_state', 'write_demo_draft'])
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export class PackageError extends Error {
  constructor(code) { super(code); this.name = 'PackageError'; this.code = code }
}
export function exact(value, keys, code = 'invalid_fields') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new PackageError(code)
  return value
}
export function strictJson(bytes) {
  let text
  try { text = decoder.decode(bytes) } catch { throw new PackageError('invalid_utf8') }
  try { return JSON.parse(text) } catch { throw new PackageError('invalid_json') }
}
export function utf8(bytes) {
  try { return decoder.decode(bytes) } catch { throw new PackageError('invalid_utf8') }
}
export function sha(bytes) { return createHash('sha256').update(bytes).digest('hex') }
export function id(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new PackageError('invalid_id')
  return value
}
export function scopes(value) {
  if (!Array.isArray(value) || new Set(value).size !== value.length
    || value.some(v => !SCOPES.includes(v))) throw new PackageError('invalid_scopes')
  return [...value].sort()
}
export function sourceBytes(files) {
  exact(files, FILES, 'invalid_file_set')
  const result = {}
  let total = 0
  for (const name of FILES) {
    const value = files[name]
    if (typeof value !== 'string') throw new PackageError('invalid_source_type')
    const bytes = encoder.encode(value)
    if (decoder.decode(bytes) !== value) throw new PackageError('invalid_unicode_scalar')
    if (bytes.length > 32 * 1024) throw new PackageError('file_too_large')
    total += bytes.length
    result[name] = bytes
  }
  if (total > 64 * 1024) throw new PackageError('source_too_large')
  return result
}
// Every record is uint32-be(name byte length), name, uint64-be(content length), raw content.
export function recordBytes(records) {
  const parts = []
  for (const [name, content] of records) {
    const nameBytes = encoder.encode(name)
    const head = Buffer.alloc(12)
    head.writeUInt32BE(nameBytes.length, 0)
    head.writeBigUInt64BE(BigInt(content.length), 4)
    parts.push(head, nameBytes, content)
  }
  return Buffer.concat(parts)
}
export function buildInputBytes(files) {
  const source = sourceBytes(files)
  return recordBytes([
    ['format', encoder.encode(FORMAT)],
    ['host_api_version', encoder.encode(HOST_API_VERSION)],
    ...FILES.map(name => [name, source[name]]),
  ])
}
export function assemble(files) {
  sourceBytes(files)
  if (/<\/style\b/i.test(files['view.css']) || /<\/script\b/i.test(files['view.js']))
    throw new PackageError('embedded_closing_tag')
  // These exact UTF-8 bytes, including LF separators, are the artifact.
  return encoder.encode('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<style>\n' + files['view.css'] + '\n</style>\n</head>\n<body>\n'
    + files['view.html'] + '\n<script>\n' + files['view.js'] + '\n</script>\n</body>\n</html>\n')
}
export function makeManifest(spec, files) {
  exact(spec, ['package_id', 'revision_id', 'base_revision', 'host_api_version', 'source_type', 'requested_scopes'])
  id(spec.package_id); id(spec.revision_id)
  if (spec.base_revision !== null) id(spec.base_revision)
  if (spec.base_revision === spec.revision_id) throw new PackageError('self_base')
  if (spec.host_api_version !== HOST_API_VERSION) throw new PackageError('host_api_mismatch')
  if (!['handwritten_fixture', 'model_candidate'].includes(spec.source_type)) throw new PackageError('invalid_source_type')
  const requested_scopes = scopes(spec.requested_scopes)
  const bytes = sourceBytes(files)
  const artifact = assemble(files)
  return {
    format: FORMAT, package_id: spec.package_id, revision_id: spec.revision_id,
    base_revision: spec.base_revision, host_api_version: HOST_API_VERSION, entry: 'view.html',
    files: Object.fromEntries(FILES.map(name => [name, { sha256: sha(bytes[name]), bytes: bytes[name].length }])),
    build_input_hash: sha(buildInputBytes(files)), artifact_hash: sha(artifact),
    source_type: spec.source_type, requested_scopes,
    execution_validation: 'not_run',
  }
}
const sortedValue = value => Array.isArray(value) ? value.map(sortedValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, sortedValue(value[key])])) : value
export function canonicalManifest(manifest) {
  exact(manifest, ['format','package_id','revision_id','base_revision','host_api_version','entry','files',
    'build_input_hash','artifact_hash','source_type','requested_scopes','execution_validation'])
  return JSON.stringify(sortedValue({ ...manifest, requested_scopes:scopes(manifest.requested_scopes) }))
}
export function validateManifest(manifest, files, artifact) {
  exact(manifest, ['format','package_id','revision_id','base_revision','host_api_version','entry','files',
    'build_input_hash','artifact_hash','source_type','requested_scopes','execution_validation'])
  if (manifest.format !== FORMAT || manifest.entry !== 'view.html'
    || manifest.execution_validation !== 'not_run') throw new PackageError('invalid_manifest')
  const expected = makeManifest({ package_id: manifest.package_id, revision_id: manifest.revision_id,
    base_revision: manifest.base_revision, host_api_version: manifest.host_api_version,
    source_type: manifest.source_type, requested_scopes: manifest.requested_scopes }, files)
  if (canonicalManifest(manifest) !== canonicalManifest(expected)) throw new PackageError('manifest_mismatch')
  if (artifact && !Buffer.from(assemble(files)).equals(Buffer.from(artifact))) throw new PackageError('artifact_mismatch')
  return expected
}
