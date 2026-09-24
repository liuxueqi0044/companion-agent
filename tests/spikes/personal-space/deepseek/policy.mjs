import { PackageError } from '../core/package.mjs'

export function authorizeAttempt(attempts, phase, estimatedMaximumUsd) {
  if (!Array.isArray(attempts) || attempts.length > 2 || ![1,2].includes(phase))
    throw new PackageError('ledger_invalid')
  if (attempts.length >= 2) throw new PackageError('attempts_exhausted')
  if (phase === 1 && attempts.length !== 0) throw new PackageError('first_attempt_unavailable')
  if (phase === 2 && (attempts.length !== 1 || attempts[0].state !== 'candidate_valid'))
    throw new PackageError('first_candidate_required')
  const spent = attempts.reduce((sum, x) => sum + x.estimated_max_usd, 0)
  if (!Number.isFinite(estimatedMaximumUsd) || estimatedMaximumUsd < 0
    || !Number.isFinite(spent) || spent + estimatedMaximumUsd > 0.05)
    throw new PackageError('budget_exceeded')
  return spent + estimatedMaximumUsd
}
