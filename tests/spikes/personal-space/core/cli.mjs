import path from 'node:path'
import { PackageError, strictJson } from './package.mjs'
import { readSource, stageSource, validateSource, sealCandidate, readRevision } from './store.mjs'

async function main(args) {
  if (args.length !== 5 || args[1] !== '--root' || args[3] !== '--revision'
    || !['readSource','stageSource','validateSource','sealCandidate','readRevision'].includes(args[0]))
    throw new PackageError('invalid_cli_arguments')
  const [operation, , root, , revision] = args
  if (!path.isAbsolute(root)) throw new PackageError('root_not_absolute')
  let result
  if (operation === 'stageSource') {
    const chunks = []
    let bytes = 0
    for await (const chunk of process.stdin) {
      bytes += chunk.length
      if (bytes > 80 * 1024) throw new PackageError('input_too_large')
      chunks.push(chunk)
    }
    const input = strictJson(Buffer.concat(chunks))
    if (input?.revision_id !== revision) throw new PackageError('revision_mismatch')
    result = await stageSource(root, input)
  } else if (operation === 'readSource') result = await readSource(root, revision)
  else if (operation === 'validateSource') result = await validateSource(root, revision)
  else if (operation === 'sealCandidate') result = await sealCandidate(root, revision)
  else result = await readRevision(root, revision)
  process.stdout.write(JSON.stringify({ ok: true, operation, result }) + '\n')
}
main(process.argv.slice(2)).catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, code: error instanceof PackageError ? error.code : 'io_failure' }) + '\n')
  process.exitCode = 1
})
