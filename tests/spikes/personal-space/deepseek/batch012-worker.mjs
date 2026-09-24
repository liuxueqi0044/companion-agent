import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PackageError } from '../core/package.mjs'
import { createBatch012Session, PREVIOUS_LEDGER_SHA256, PREVIOUS_LOCK_SHA256 } from './batch012-session.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../../..')

export function productionSession() {
  const evidence = path.join(repo, 'reports/evidence/BATCH-012')
  const previous = path.join(repo, 'reports/evidence/BATCH-011')
  return createBatch012Session({ evidenceDir:evidence,
    previousLedgerPath:path.join(previous, 'live-attempts.json'),
    previousLockPath:path.join(previous, 'live.lock'),
    previousLedgerRef:'reports/evidence/BATCH-011/live-attempts.json',
    expectedPreviousLedgerSha256:PREVIOUS_LEDGER_SHA256,
    expectedPreviousLockSha256:PREVIOUS_LOCK_SHA256,
    docsPath:path.join(evidence, 'deepseek-doc-check.json') })
}

export async function dispatchBatch012(args, session) {
  const mode = args[0] ?? '--plan'
  if (!['--plan', '--offline', '--reserve', '--execute', '--mark-presend-failed'].includes(mode)
    || args.length > 2) throw new PackageError('invalid_arguments')
  if (args.length === 2 && args[1] !== '1') throw new PackageError('invalid_phase')
  const token = process.env.PERSONAL_SPACE_ATTEMPT_TOKEN
  if (mode === '--plan') return session.plan()
  if (mode === '--offline') return session.offline()
  if (mode === '--reserve') return session.reserve(token)
  if (mode === '--execute') return session.execute(token, process.env.PERSONAL_SPACE_DEEPSEEK_KEY)
  return session.markPresendFailure(token, process.env.PERSONAL_SPACE_PRESEND_ERROR_CATEGORY)
}

async function main() {
  try {
    const value = await dispatchBatch012(process.argv.slice(2), productionSession())
    process.stdout.write(JSON.stringify({ ok:true, ...value }) + '\n')
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok:false,
      code:error instanceof PackageError ? error.code : 'io_failure' }) + '\n')
    process.exitCode = 1
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  void main()
