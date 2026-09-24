import * as fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { FILES, HOST_API_VERSION, id, scopes, sha, strictJson, sourceBytes } from '../../core/package.mjs'
import { stageSource, sealCandidate, readRevision } from '../../core/store.mjs'
import { AUTHORING_VERSION, authorSourceHash, validateAuthor, AuthoringError } from '../validation/validate.mjs'
import { prepareBuild, sdkHash, validatorHash, builderHash, BUILD_VERSION, SDK_SEPARATOR } from '../build/build.mjs'

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const HASH = /^[a-f0-9]{64}$/
const BUILD_VERSIONS = new Set(['authoring-builder/1','authoring-builder/2'])
const RULE_VERSIONS = new Set(['authoring-validator/1','authoring-validator/2'])
const goodId = value => typeof value === 'string' && ID.test(value)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
export class WorkspaceError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'WorkspaceError' }
}
const must = (condition, code) => { if (!condition) throw new WorkspaceError(code) }
const stable = value => JSON.stringify(value)
const digest = value => sha(Buffer.from(stable(value), 'utf8'))
const safeId = value => { must(goodId(value), 'invalid_id'); return value }
const safeHash = value => typeof value === 'string' && HASH.test(value)
const sealed = value => ({ ...value, integrity:digest(value) })
const validSeal = value => value && typeof value === 'object' && !Array.isArray(value)
  && exact(value, [...Object.keys(value).filter(k => k !== 'integrity'), 'integrity'])
  && typeof value.integrity === 'string' && digest(Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'integrity'))) === value.integrity
const validOperation = value => exact(value,['sequence','operation','from','to','previous_operation','integrity'])
  && validSeal(value) && Number.isSafeInteger(value.sequence) && value.sequence >= 1
  && ['create','change','restore'].includes(value.operation)
  && (value.from === null || goodId(value.from)) && goodId(value.to)
  && (value.previous_operation === null || goodId(value.previous_operation))

async function checked(p) {
  const stat = await fs.lstat(p)
  const real = await fs.realpath(p)
  if (stat.isSymbolicLink() || path.normalize(real).toLowerCase() !== path.normalize(p).toLowerCase())
    throw new WorkspaceError('reparse_point')
  return stat
}
async function safePath(root, segments, create = false) {
  must(path.isAbsolute(root), 'root_not_absolute')
  let current = path.parse(path.resolve(root)).root
  await checked(current)
  const all = [...path.resolve(root).slice(current.length).split(path.sep).filter(Boolean), ...segments]
  for (const segment of all) {
    must(goodId(segment) || ['author-store','effective-store','candidates','revisions','operations','receipts','head.json','meta.json','lock'].includes(segment), 'path_traversal')
    current = path.join(current, segment)
    try { await checked(current) } catch (cause) {
      if (!create || cause.code !== 'ENOENT') throw cause
      await fs.mkdir(current)
      await checked(current)
    }
  }
  return current
}
async function fileAt(root, segments) {
  const parent = await safePath(root, segments.slice(0,-1))
  const name = segments.at(-1)
  must(goodId(name) || (typeof name === 'string' && /^[A-Za-z0-9_.-]+\.json$/.test(name)), 'path_traversal')
  const p = path.join(parent, name)
  try { await checked(p) } catch (cause) { if (cause.code !== 'ENOENT') throw cause }
  return p
}
async function writeNew(file, value) {
  const handle = await fs.open(file, 'wx', 0o600)
  try { await handle.writeFile(stable(value) + '\n'); await handle.sync() } finally { await handle.close() }
}
async function replace(file, value) {
  const temp = path.join(path.dirname(file), 'tmp-' + randomUUID())
  await writeNew(temp, value)
  try { await fs.rename(temp, file) } catch (cause) { await fs.unlink(temp).catch(() => {}); throw cause }
}
async function readJson(file, max = 128 * 1024) {
  let stat, bytes
  try {
    stat = await fs.stat(file)
    must(stat.isFile() && stat.size <= max, 'recovery_required')
    bytes = await fs.readFile(file)
  } catch (cause) {
    if (cause instanceof WorkspaceError) throw cause
    throw new WorkspaceError('recovery_required')
  }
  must(bytes.length <= max, 'recovery_required')
  try { return strictJson(bytes) } catch { throw new WorkspaceError('recovery_required') }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export class AuthorWorkspace {
  constructor(root) { must(path.isAbsolute(root), 'root_not_absolute'); this.root = path.resolve(root) }
  async folder(workspace, create = false) {
    safeId(workspace)
    return safePath(this.root, [workspace], create)
  }
  async withLock(workspace, action) {
    const folder = await this.folder(workspace)
    const lock = path.join(folder, 'lock')
    let handle
    for (let attempt = 0; attempt < 100; attempt++) {
      try { handle = await fs.open(lock, 'wx', 0o600); break }
      catch (cause) { if (cause.code !== 'EEXIST') throw cause; await pause(5) }
    }
    must(handle, 'workspace_busy_or_recovery_required')
    try { await handle.writeFile(String(process.pid)); await handle.sync(); return await action(folder) }
    finally { await handle.close(); await fs.unlink(lock) }
  }
  async meta(workspace) {
    let value
    try { value = await readJson(await fileAt(this.root, [workspace,'meta.json'])) }
    catch { throw new WorkspaceError('recovery_required') }
    must(exact(value, ['format','workspace_id','source_type','origin','requested_scopes','integrity'])
      && validSeal(value) && value.format === AUTHORING_VERSION && value.workspace_id === workspace
      && ['handwritten_fixture','model_candidate'].includes(value.source_type)
      && Array.isArray(value.requested_scopes), 'recovery_required')
    let canonicalScopes
    try { canonicalScopes = scopes(value.requested_scopes) }
    catch { throw new WorkspaceError('recovery_required') }
    must(JSON.stringify(canonicalScopes) === JSON.stringify(value.requested_scopes), 'recovery_required')
    must(value.origin && typeof value.origin === 'object' && !Array.isArray(value.origin)
      && value.origin.kind === value.source_type && typeof value.origin.reference === 'string'
      && value.origin.reference.length <= 128
      && (value.source_type === 'model_candidate'
        ? exact(value.origin,['kind','reference','original_source_hash']) && safeHash(value.origin.original_source_hash)
        : exact(value.origin,['kind','reference'])), 'recovery_required')
    return value
  }
  async head(workspace) {
    let value
    try { value = await readJson(await fileAt(this.root, [workspace,'head.json'])) }
    catch { throw new WorkspaceError('recovery_required') }
    must(exact(value, ['format','revision_id','source_hash','sequence','operation_id',
      'current_check','current_build','last_good_build','integrity']) && validSeal(value)
      && value.format === AUTHORING_VERSION && safeHash(value.source_hash)
      && Number.isSafeInteger(value.sequence) && value.sequence >= 1
      && goodId(value.revision_id) && goodId(value.operation_id), 'recovery_required')
    for (const key of ['current_check','current_build','last_good_build'])
      must(value[key] === null || goodId(value[key]), 'recovery_required')
    return value
  }
  async authorRevision(workspace, revision) {
    const folder = await this.folder(workspace)
    const source = await readRevision(path.join(folder,'author-store'), safeId(revision))
    return { ...source, source_hash:authorSourceHash(source.files) }
  }
  async receipt(workspace, receiptId) {
    const value = await readJson(await fileAt(this.root, [workspace,'receipts',safeId(receiptId) + '.json']))
    const common = ['id','kind','head','source_hash','sdk_hash','validator_hash','build_version','integrity']
    const checkFields = [...common,'validation','validation_report_hash']
    const buildFields = [...common,'builder_hash','effective_revision','effective_source_hash',
      'artifact_hash','author_source_hash','validation_report_hash','validation',
      'author_base_revision','effective_base_revision','requested_scopes','source_type']
    must(validSeal(value) && value.id === receiptId && ['check','build'].includes(value.kind)
      && goodId(value.head) && safeHash(value.source_hash)
      && safeHash(value.validator_hash) && safeHash(value.sdk_hash)
      && safeHash(value.validation_report_hash) && BUILD_VERSIONS.has(value.build_version)
      && (value.kind === 'check'
        ? (exact(value,checkFields) || exact(value,[...checkFields,'failure']))
          && value.validation && ['passed','failed'].includes(value.validation.source_validation)
          && RULE_VERSIONS.has(value.validation.rule_version)
          && Array.isArray(value.validation.diagnostics) && value.validation.diagnostics.length <= 20
          && digest(value.validation) === value.validation_report_hash
          && (value.failure === undefined || typeof value.failure === 'string')
        : exact(value,buildFields) && safeHash(value.builder_hash)
          && safeHash(value.author_source_hash)
          && value.validation?.source_validation === 'passed'
          && RULE_VERSIONS.has(value.validation.rule_version)
          && Array.isArray(value.validation.diagnostics)
          && digest(value.validation) === value.validation_report_hash
          && (value.author_base_revision === null || goodId(value.author_base_revision))
          && value.effective_base_revision === null && Array.isArray(value.requested_scopes)
          && ['handwritten_fixture','model_candidate'].includes(value.source_type)),
      'recovery_required')
    const source = await this.authorRevision(workspace, value.head)
    must(source.source_hash === value.source_hash
      && value.validation.source_hash === value.source_hash
      && value.validation.format === AUTHORING_VERSION
      && value.validation.execution_validation === 'not_run'
      && value.validation.native_validation === 'not_run'
      && value.validation.visual_validation === 'not_run', 'recovery_required')
    if (value.kind === 'build') {
      must(goodId(value.effective_revision) && safeHash(value.artifact_hash)
        && safeHash(value.effective_source_hash), 'recovery_required')
      const folder = await this.folder(workspace)
      let effective
      try { effective = await readRevision(path.join(folder,'effective-store'), value.effective_revision) }
      catch { throw new WorkspaceError('recovery_required') }
      const suffix = SDK_SEPARATOR + source.files['view.js']
      const effectiveJs = effective.files['view.js']
      const sdkPrefix = effectiveJs.endsWith(suffix) ? effectiveJs.slice(0,-suffix.length) : null
      must(effective.manifest.artifact_hash === value.artifact_hash
        && effective.manifest.build_input_hash === value.effective_source_hash
        && effective.files['view.html'] === source.files['view.html']
        && effective.files['view.css'] === source.files['view.css']
        && sdkPrefix !== null && sha(Buffer.from(sdkPrefix,'utf8')) === value.sdk_hash
        && value.author_source_hash === value.source_hash
        && source.manifest.base_revision === value.author_base_revision
        && source.manifest.package_id === workspace
        && source.manifest.source_type === value.source_type
        && effective.manifest.package_id === workspace
        && effective.manifest.source_type === value.source_type
        && JSON.stringify(source.manifest.requested_scopes) === JSON.stringify(value.requested_scopes)
        && JSON.stringify(effective.manifest.requested_scopes) === JSON.stringify(value.requested_scopes),
        'recovery_required')
    }
    return value
  }
  async read(workspace) {
    const [meta, head] = await Promise.all([this.meta(workspace), this.head(workspace)])
    let author
    try { author = await this.authorRevision(workspace, head.revision_id) }
    catch { throw new WorkspaceError('recovery_required') }
    must(author.source_hash === head.source_hash && author.manifest.source_type === meta.source_type
      && author.manifest.package_id === workspace
      && JSON.stringify(author.manifest.requested_scopes) === JSON.stringify(meta.requested_scopes),
      'recovery_required')
    const folder = await this.folder(workspace)
    let op
    try { op = await readJson(await fileAt(this.root,[workspace,'operations',head.operation_id + '.json'])) }
    catch { throw new WorkspaceError('recovery_required') }
    must(validOperation(op) && op.sequence === head.sequence && op.to === head.revision_id,
      'recovery_required')
    const receipts = {}
    for (const field of ['current_check','current_build','last_good_build']) {
      if (!head[field]) { receipts[field] = null; continue }
      try { receipts[field] = await this.receipt(workspace, head[field]) }
      catch { throw new WorkspaceError('recovery_required') }
    }
    must((!receipts.current_check || receipts.current_check.kind === 'check')
      && (!receipts.current_build || receipts.current_build.kind === 'build')
      && (!receipts.last_good_build || receipts.last_good_build.kind === 'build'),
      'recovery_required')
    if (receipts.current_check) must(receipts.current_check.head === head.revision_id
      && receipts.current_check.source_hash === head.source_hash, 'recovery_required')
    if (receipts.current_build) must(receipts.current_build.head === head.revision_id
      && receipts.current_build.source_hash === head.source_hash, 'recovery_required')
    for (const value of Object.values(receipts)) if (value) must(
      value.kind === 'check' || value.source_type === meta.source_type
        && JSON.stringify(value.requested_scopes) === JSON.stringify(meta.requested_scopes),
      'recovery_required')
    const receipt_current = value => !!value && value.source_hash === head.source_hash
      && value.validator_hash === validatorHash() && value.sdk_hash === sdkHash()
      && (value.kind !== 'build' || value.builder_hash === builderHash())
    return { workspace_id:workspace, meta, head, files:author.files, receipts,
      current_check_valid:receipt_current(receipts.current_check),
      current_check_passed:receipt_current(receipts.current_check)
        && receipts.current_check.validation.source_validation === 'passed',
      current_build_valid:receipt_current(receipts.current_build)
        && receipts.current_build?.kind === 'build'
        && receipts.current_build.validation.source_validation === 'passed' }
  }
  async create(input) {
    must(exact(input,['workspace_id','format','files','source_type','origin','requested_scopes']), 'invalid_request')
    safeId(input.workspace_id); must(input.format === AUTHORING_VERSION, 'invalid_format')
    sourceBytes(input.files)
    must(['handwritten_fixture','model_candidate'].includes(input.source_type), 'invalid_source_type')
    must(input.origin && typeof input.origin === 'object' && !Array.isArray(input.origin)
      && input.origin.kind === input.source_type && typeof input.origin.reference === 'string'
      && input.origin.reference.length <= 128, 'invalid_origin')
    if (input.source_type === 'model_candidate')
      must(exact(input.origin,['kind','reference','original_source_hash'])
        && safeHash(input.origin.original_source_hash), 'invalid_origin')
    else must(exact(input.origin,['kind','reference']), 'invalid_origin')
    const requested_scopes = scopes(input.requested_scopes)
    const workspace = input.workspace_id
    const parent = await safePath(this.root, [], true)
    const folder = path.join(parent,workspace)
    try { await fs.mkdir(folder) }
    catch (cause) {
      if (cause.code === 'EEXIST') throw new WorkspaceError('workspace_exists_or_recovery_required')
      throw cause
    }
    await checked(folder)
    for (const name of ['author-store','effective-store']) {
      await safePath(this.root,[workspace,name],true)
      await safePath(this.root,[workspace,name,'candidates'],true)
      await safePath(this.root,[workspace,name,'revisions'],true)
    }
    await safePath(this.root,[workspace,'operations'],true)
    await safePath(this.root,[workspace,'receipts'],true)
    const revision = 'a-' + randomUUID().replaceAll('-','')
    await stageSource(path.join(folder,'author-store'), { package_id:workspace, revision_id:revision,
      base_revision:null, host_api_version:HOST_API_VERSION, source_type:input.source_type,
      requested_scopes, changes:input.files })
    await sealCandidate(path.join(folder,'author-store'), revision)
    const source_hash = authorSourceHash(input.files)
    const meta = sealed({ format:AUTHORING_VERSION, workspace_id:workspace,
      source_type:input.source_type, origin:input.origin, requested_scopes })
    await writeNew(path.join(folder,'meta.json'), meta)
    const operation_id = 'o-' + randomUUID().replaceAll('-','')
    await writeNew(path.join(folder,'operations',operation_id+'.json'),
      sealed({ sequence:1, operation:'create', from:null, to:revision, previous_operation:null }))
    await writeNew(path.join(folder,'head.json'), sealed({ format:AUTHORING_VERSION,
      revision_id:revision, source_hash, sequence:1, operation_id,
      current_check:null, current_build:null, last_good_build:null }))
    return this.read(workspace)
  }
  async commitHead(workspace, oldHead, nextRevision, operation, extra = {}) {
    const operation_id = 'o-' + randomUUID().replaceAll('-','')
    const op = sealed({ sequence:oldHead.sequence+1, operation, from:oldHead.revision_id,
      to:nextRevision, previous_operation:oldHead.operation_id })
    await writeNew(await fileAt(this.root,[workspace,'operations',operation_id+'.json']), op)
    const author = await this.authorRevision(workspace,nextRevision)
    const next = sealed({ format:AUTHORING_VERSION, revision_id:nextRevision,
      source_hash:author.source_hash, sequence:oldHead.sequence+1, operation_id,
      current_check:null, current_build:null, last_good_build:oldHead.last_good_build, ...extra })
    await replace(await fileAt(this.root,[workspace,'head.json']),next)
    return next
  }
  async change(workspace, expected_head, changes) {
    must(safeHash(expected_head), 'invalid_expected_head')
    must(changes && typeof changes === 'object' && !Array.isArray(changes)
      && Object.keys(changes).length >= 1 && Object.keys(changes).length <= 3
      && Object.keys(changes).every(name => FILES.includes(name)), 'invalid_changes')
    return this.withLock(workspace, async folder => {
      const current = await this.read(workspace)
      must(current.head.integrity === expected_head, 'conflict')
      sourceBytes({ ...current.files, ...changes })
      const revision = 'a-' + randomUUID().replaceAll('-','')
      await stageSource(path.join(folder,'author-store'), { package_id:workspace, revision_id:revision,
        base_revision:current.head.revision_id, host_api_version:HOST_API_VERSION,
        source_type:current.meta.source_type, requested_scopes:current.meta.requested_scopes, changes })
      await sealCandidate(path.join(folder,'author-store'),revision)
      const head = await this.commitHead(workspace,current.head,revision,'change')
      return { head, source_hash:head.source_hash, next:'check_then_build' }
    })
  }
  async restore(workspace, expected_head, target_revision) {
    must(safeHash(expected_head), 'invalid_expected_head'); safeId(target_revision)
    return this.withLock(workspace, async () => {
      const current = await this.read(workspace)
      must(current.head.integrity === expected_head, 'conflict')
      const target = await this.authorRevision(workspace,target_revision)
      must(target.manifest.package_id === workspace && target.manifest.source_type === current.meta.source_type,
        'revision_unavailable')
      const head = await this.commitHead(workspace,current.head,target_revision,'restore')
      return { head, source_hash:head.source_hash, next:'check_then_build' }
    })
  }
  async history(workspace) {
    const current = await this.read(workspace)
    const folder = await this.folder(workspace)
    const revisions = []
    for (const name of (await fs.readdir(path.join(folder,'author-store','revisions'))).sort()) {
      if (!goodId(name) || name.startsWith('tmp-')) continue
      const source = await this.authorRevision(workspace,name)
      revisions.push({ revision_id:name, base_revision:source.manifest.base_revision,
        source_hash:source.source_hash, source_type:source.manifest.source_type })
    }
    const operations = []
    let opId = current.head.operation_id
    while (opId) {
      const op = await readJson(await fileAt(this.root,[workspace,'operations',opId+'.json']))
      must(validOperation(op) && op.sequence === current.head.sequence - operations.length,
        'recovery_required')
      operations.push(op); opId = op.previous_operation
    }
    must(operations.length === current.head.sequence, 'recovery_required')
    return { workspace_id:workspace, head:current.head.revision_id, revisions, operations }
  }
  async publishReceipt(workspace, expectedHead, value, kind) {
    return this.withLock(workspace, async () => {
      const current = await this.read(workspace)
      must(current.head.integrity === expectedHead.integrity, 'stale_head')
      const idValue = (kind === 'build' ? 'b-' : 'c-') + randomUUID().replaceAll('-','')
      const receipt = sealed({ ...value, id:idValue, kind, head:expectedHead.revision_id,
        source_hash:expectedHead.source_hash, sdk_hash:sdkHash(), validator_hash:validatorHash() })
      await writeNew(await fileAt(this.root,[workspace,'receipts',idValue+'.json']),receipt)
      const head = sealed({ ...Object.fromEntries(Object.entries(current.head).filter(([k])=>k !== 'integrity')),
        current_check:kind === 'check' ? idValue : current.head.current_check,
        current_build:kind === 'build' ? idValue : current.head.current_build,
        last_good_build:kind === 'build' ? idValue : current.head.last_good_build })
      await replace(await fileAt(this.root,[workspace,'head.json']),head)
      return receipt
    })
  }
  async check(workspace) {
    const start = await this.read(workspace)
    const validation = validateAuthor({ format:AUTHORING_VERSION, files:start.files })
    const receipt = await this.publishReceipt(workspace,start.head,
      { validation, validation_report_hash:digest(validation), build_version:BUILD_VERSION },'check')
    return { receipt, current:validation.source_validation === 'passed', validation }
  }
  async build(workspace) {
    const start = await this.read(workspace)
    let prepared
    try { prepared = prepareBuild({ format:AUTHORING_VERSION, files:start.files }) }
    catch (cause) {
      if (cause instanceof AuthoringError && cause.validation) {
        const receipt = await this.publishReceipt(workspace,start.head,
          { validation:cause.validation, validation_report_hash:cause.validation_report_hash,
            build_version:BUILD_VERSION, failure:cause.code },'check')
        return { status:'failed', code:cause.code, validation:cause.validation,
          receipt, last_good_build:start.head.last_good_build }
      }
      throw cause
    }
    const folder = await this.folder(workspace)
    const effective_revision = 'e-' + prepared.artifact_hash.slice(0,32)
    const effectiveRoot = path.join(folder,'effective-store')
    const spec = { package_id:workspace, revision_id:effective_revision, base_revision:null,
      host_api_version:HOST_API_VERSION, source_type:start.meta.source_type,
      requested_scopes:start.meta.requested_scopes, changes:prepared.files }
    try { await stageSource(effectiveRoot,spec) }
    catch (cause) { if (cause.code !== 'EEXIST') throw cause }
    await sealCandidate(effectiveRoot,effective_revision)
    const actual = await readRevision(effectiveRoot,effective_revision)
    must(actual.manifest.artifact_hash === prepared.artifact_hash
      && actual.manifest.build_input_hash === prepared.effective_source_hash
      && actual.manifest.source_type === start.meta.source_type, 'build_integrity_failed')
    const receipt = await this.publishReceipt(workspace,start.head, {
      build_version:BUILD_VERSION, builder_hash:builderHash(), effective_revision,
      effective_source_hash:prepared.effective_source_hash, artifact_hash:prepared.artifact_hash,
      author_source_hash:prepared.author_source_hash, validation_report_hash:prepared.validation_report_hash,
      validation:prepared.source_validation,
      author_base_revision:(await this.authorRevision(workspace,start.head.revision_id)).manifest.base_revision,
      effective_base_revision:actual.manifest.base_revision,
      requested_scopes:start.meta.requested_scopes, source_type:start.meta.source_type }, 'build')
    return { status:'built', receipt, manifest:actual.manifest }
  }
}
