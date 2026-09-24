import type { InputDraft, Issue, RequiredColumn } from '../model'

export const INPUT_VERSION = 'local-review-input/1' as const
export const CANDIDATE_VERSION = 'local-structured-candidate/1' as const
export const REVIEW_VERSION = 'local-candidate-review/1' as const
export const CLAIM_FIELDS = ['summary', 'deliverable', 'time', 'place', 'special'] as const
export type ClaimField = typeof CLAIM_FIELDS[number]
export type EvidenceRange = { start: number; end: number }
export type TextClaim = { text: string | null; evidence: EvidenceRange[] }
export type CandidateRow = { recordIndex: number } & Record<RequiredColumn, string | null>
export type QuestionTarget =
  | { kind: 'requirement'; field: ClaimField }
  | { kind: 'csv'; recordIndex: number | null; column: RequiredColumn }
export type CandidateQuestion = { text: string; target: QuestionTarget }
export type StructuredCandidate = {
  version: typeof CANDIDATE_VERSION
  inputHash: string
  summary: TextClaim
  elements: Record<Exclude<ClaimField, 'summary'>, TextClaim>
  rows: CandidateRow[]
  questions: CandidateQuestion[]
}
export type InputSnapshot = {
  version: typeof INPUT_VERSION
  inputHash: string
  draft: InputDraft
  draftJson: string
  rows: string[][]
  issues: Issue[]
}
export type ValidatedCandidate = { candidate: StructuredCandidate; candidateSha256: string }
export type ConfirmationState = Record<ClaimField, boolean>
