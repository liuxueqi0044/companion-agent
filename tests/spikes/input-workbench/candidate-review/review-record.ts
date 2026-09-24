import { DraftInputError } from '../model'
import { CLAIM_FIELDS, REVIEW_VERSION, type ConfirmationState,
  type InputSnapshot, type ValidatedCandidate } from './types'

const LIMIT = 12 * 1024 * 1024
export function reviewRecordBytes(snapshot: InputSnapshot, validated: ValidatedCandidate,
  confirmations: ConfirmationState): Uint8Array {
  if (validated.candidate.inputHash !== snapshot.inputHash)
    throw new DraftInputError('input_hash', '候选与当前输入快照不匹配，不能导出核对记录。')
  const claim = (field: typeof CLAIM_FIELDS[number]) => field === 'summary'
    ? validated.candidate.summary : validated.candidate.elements[field]
  const checked = Object.fromEntries(CLAIM_FIELDS.map(field => {
    if (typeof confirmations[field] !== 'boolean')
      throw new DraftInputError('confirmation', '本地人工核对状态无效。')
    if (claim(field).text === null && confirmations[field])
      throw new DraftInputError('confirmation', '未提取的需求字段不能标为已核对。')
    return [field, confirmations[field]]
  })) as ConfirmationState
  const record = {
    version: REVIEW_VERSION,
    inputHash: snapshot.inputHash,
    candidateSha256: validated.candidateSha256,
    candidate: validated.candidate,
    confirmations: checked,
    localChecks: {
      csvIssues: snapshot.issues.map(issue => ({ ...issue })),
      unextractedClaims: CLAIM_FIELDS.filter(field => claim(field).text === null),
    },
  }
  const bytes = new TextEncoder().encode(JSON.stringify(record, null, 2))
  if (bytes.byteLength > LIMIT) throw new DraftInputError('size', '核对记录 JSON 超过 12 MiB。')
  return bytes
}
