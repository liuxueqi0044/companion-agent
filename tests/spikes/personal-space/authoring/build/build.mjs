import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sha, recordBytes, buildInputBytes, sourceBytes, assemble } from '../../core/package.mjs'
import { validateAuthor, parseClassicScript, AuthoringError, AUTHORING_VERSION } from '../validation/validate.mjs'

export const BUILD_VERSION = 'authoring-builder/2'
const SDK_URL = new URL('../client/client-runtime.js', import.meta.url)
const VALIDATOR_URL = new URL('../validation/validate.mjs', import.meta.url)
const BUILD_URL = import.meta.url
export const SDK_SEPARATOR = ';\n/* authoring-kit/1: author view.js follows */\n'
const SDK_BYTES = readFileSync(SDK_URL)
export const sdkHash = () => sha(SDK_BYTES)
const parserInputs = ['parse5','typescript','postcss','@babel/parser']
const validatorIdentity = sha(recordBytes([
  ['validator.mjs', readFileSync(VALIDATOR_URL)],
  ...parserInputs.map(name => [name, readFileSync(fileURLToPath(import.meta.resolve(name)))]),
]))
export const validatorHash = () => validatorIdentity
export const builderHash = () => sha(readFileSync(new URL(BUILD_URL)))
const stable = value => JSON.stringify(value)

export function prepareBuild(input) {
  const validation = validateAuthor(input)
  const validation_report_hash = sha(Buffer.from(stable(validation)))
  if (validation.source_validation !== 'passed')
    throw Object.assign(new AuthoringError('source_invalid'), { validation, validation_report_hash })
  const effective = { ...input.files,
    'view.js':SDK_BYTES.toString('utf8') + SDK_SEPARATOR + input.files['view.js'] }
  try { sourceBytes(effective) } catch (cause) {
    throw Object.assign(new AuthoringError(cause.code || 'effective_source_invalid'),
      { validation, validation_report_hash })
  }
  const syntax = parseClassicScript(effective['view.js'])
  if (syntax) {
    const authorOffset = SDK_BYTES.toString('utf8').length + SDK_SEPARATOR.length
    const diagnostic = syntax.offset >= authorOffset
      ? { code:'effective_author_script_invalid', file:'view.js',
          start_offset:syntax.offset-authorOffset, message:syntax.message }
      : { code:'effective_sdk_or_assembly_invalid', file:null, message:syntax.message }
    throw Object.assign(new AuthoringError(diagnostic.code),
      { validation, validation_report_hash, diagnostic })
  }
  let artifact
  try { artifact = assemble(effective) } catch (cause) {
    throw Object.assign(new AuthoringError(cause.code || 'effective_source_invalid'),
      { validation, validation_report_hash })
  }
  return { format:AUTHORING_VERSION, build_version:BUILD_VERSION, files:effective,
    artifact, source_validation:validation, validation_report_hash,
    author_source_hash:validation.source_hash, sdk_hash:sdkHash(), validator_hash:validatorHash(),
    builder_hash:builderHash(), effective_source_hash:sha(buildInputBytes(effective)),
    artifact_hash:sha(artifact) }
}
