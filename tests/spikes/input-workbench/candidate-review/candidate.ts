import { REQUIRED_COLUMNS, strictDecode, utf8Bytes, type Modification, type RequiredColumn } from '../model'
import { deepFreeze, sha256 } from './snapshot'
import { CANDIDATE_VERSION, CLAIM_FIELDS, type CandidateQuestion, type CandidateRow,
  type ClaimField, type EvidenceRange, type InputSnapshot, type QuestionTarget,
  type StructuredCandidate, type TextClaim, type ValidatedCandidate } from './types'

const LIMIT = 8 * 1024 * 1024
const ELEMENTS = ['deliverable', 'time', 'place', 'special'] as const
type JsonObject = Record<string, unknown>

export class CandidateError extends Error {
  constructor(readonly path: string, reason: string) {
    super(`${path}：${reason}`)
    this.name = 'CandidateError'
  }
}
function reject(path: string, reason: string): never { throw new CandidateError(path, reason) }
function object(value: unknown, path: string, keys: readonly string[]): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    reject(path, '应为对象')
  const result = value as JsonObject
  if (keys.some(key => !Object.hasOwn(result, key))) reject(path, '缺少必填字段')
  if (Object.keys(result).some(key => !keys.includes(key))) reject(path, '包含未授权字段')
  return result
}
function list(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) reject(path, '应为数组')
  if (value.length > maximum) reject(path, `超过 ${maximum} 项上限`)
  return value
}
function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) reject(path, '应为安全整数')
  return value
}
function splitsPair(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return false
  const left = value.charCodeAt(index - 1)
  const right = value.charCodeAt(index)
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff
}
function claim(value: unknown, path: string, requirement: string): TextClaim {
  const obj = object(value, path, ['text', 'evidence'])
  const ranges = list(obj.evidence, `${path}.evidence`, 8)
  if (obj.text === null) {
    if (ranges.length) reject(`${path}.evidence`, '未提取内容不能有引用')
    return { text: null, evidence: [] }
  }
  if (typeof obj.text !== 'string' || !obj.text.trim() || utf8Bytes(obj.text) > 2048)
    reject(`${path}.text`, '应为 1–2048 UTF-8 字节的非空文字或 null')
  if (!ranges.length) reject(`${path}.evidence`, '有值时需要至少一处原文范围')
  const evidence: EvidenceRange[] = ranges.map((entry, index) => {
    const at = `${path}.evidence[${index}]`
    const range = object(entry, at, ['start', 'end'])
    const start = integer(range.start, `${at}.start`)
    const end = integer(range.end, `${at}.end`)
    if (start < 0 || start >= end || end > requirement.length
        || splitsPair(requirement, start) || splitsPair(requirement, end))
      reject(at, '原文范围越界、为空或切开代理对')
    return { start, end }
  })
  return { text: obj.text, evidence }
}
function column(value: unknown, path: string): RequiredColumn {
  if (typeof value !== 'string' || !REQUIRED_COLUMNS.includes(value as RequiredColumn))
    reject(path, '不是允许的 CSV 列')
  return value as RequiredColumn
}
function target(value: unknown, path: string, snapshot: InputSnapshot): QuestionTarget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject(path, '应为目标对象')
  const raw = value as JsonObject
  if (raw.kind === 'requirement') {
    const obj = object(value, path, ['kind', 'field'])
    if (typeof obj.field !== 'string' || !CLAIM_FIELDS.includes(obj.field as ClaimField))
      reject(`${path}.field`, '不是允许的需求字段')
    return { kind: 'requirement', field: obj.field as ClaimField }
  }
  if (raw.kind === 'csv') {
    const obj = object(value, path, ['kind', 'recordIndex', 'column'])
    const name = column(obj.column, `${path}.column`)
    const exists = snapshot.draft.original.columnIndex[name] !== undefined
    if (obj.recordIndex === null) {
      if (exists) reject(`${path}.recordIndex`, '整列目标只用于缺失的列')
      return { kind: 'csv', recordIndex: null, column: name }
    }
    const recordIndex = integer(obj.recordIndex, `${path}.recordIndex`)
    if (!exists || recordIndex < 1 || recordIndex > snapshot.rows.length)
      reject(`${path}.recordIndex`, '行目标越界或该列缺失')
    return { kind: 'csv', recordIndex, column: name }
  }
  return reject(`${path}.kind`, '不是允许的目标类别')
}
function question(value: unknown, path: string, snapshot: InputSnapshot): CandidateQuestion {
  const obj = object(value, path, ['text', 'target'])
  if (typeof obj.text !== 'string' || !obj.text.trim() || utf8Bytes(obj.text) > 1024)
    reject(`${path}.text`, '应为 1–1024 UTF-8 字节的非空问题')
  return { text: obj.text, target: target(obj.target, `${path}.target`, snapshot) }
}
function row(value: unknown, path: string, snapshot: InputSnapshot): CandidateRow {
  const obj = object(value, path, ['recordIndex', ...REQUIRED_COLUMNS])
  const recordIndex = integer(obj.recordIndex, `${path}.recordIndex`)
  if (recordIndex < 1 || recordIndex > snapshot.rows.length)
    reject(`${path}.recordIndex`, '数据记录序号越界')
  const result = { recordIndex } as CandidateRow
  for (const name of REQUIRED_COLUMNS) {
    const columnIndex = snapshot.draft.original.columnIndex[name]
    const expected = columnIndex === undefined ? null : snapshot.rows[recordIndex - 1]?.[columnIndex]
    const supplied = obj[name]
    if ((typeof supplied !== 'string' && supplied !== null) || supplied !== expected)
      reject(`${path}.${name}`, '必须与当前快照的原始或本地修改值完全一致')
    result[name] = supplied
  }
  return result
}

/** Rejects untrusted bytes before returning an explicit, sorted, display-only projection. */
export async function validateCandidateBytes(bytes: ArrayBuffer, snapshot: InputSnapshot): Promise<ValidatedCandidate> {
  if (bytes.byteLength > LIMIT) reject('$', '候选 JSON 超过 8 MiB')
  let raw: unknown
  try { raw = JSON.parse(strictDecode(bytes)) as unknown }
  catch { return reject('$', '不是有效的 UTF-8 JSON') }
  const root = object(raw, '$', ['version', 'inputHash', 'summary', 'elements', 'rows', 'questions'])
  if (root.version !== CANDIDATE_VERSION) reject('$.version', '候选格式版本不匹配')
  if (root.inputHash !== snapshot.inputHash) reject('$.inputHash', '与当前输入快照不匹配')
  const summary = claim(root.summary, '$.summary', snapshot.draft.requirementText)
  const elementsRaw = object(root.elements, '$.elements', ELEMENTS)
  const elements = {
    deliverable: claim(elementsRaw.deliverable, '$.elements.deliverable', snapshot.draft.requirementText),
    time: claim(elementsRaw.time, '$.elements.time', snapshot.draft.requirementText),
    place: claim(elementsRaw.place, '$.elements.place', snapshot.draft.requirementText),
    special: claim(elementsRaw.special, '$.elements.special', snapshot.draft.requirementText),
  }
  const rowsRaw = list(root.rows, '$.rows', snapshot.rows.length)
  if (rowsRaw.length !== snapshot.rows.length) reject('$.rows', '必须完整覆盖每条 CSV 数据记录')
  const rows = rowsRaw.map((entry, index) => row(entry, `$.rows[${index}]`, snapshot))
  const seen = new Set(rows.map(entry => entry.recordIndex))
  if (seen.size !== rows.length) reject('$.rows', '数据记录序号重复')
  rows.sort((left, right) => left.recordIndex - right.recordIndex)
  const questions = list(root.questions, '$.questions', 100)
    .map((entry, index) => question(entry, `$.questions[${index}]`, snapshot))
  const candidate: StructuredCandidate = deepFreeze({
    version: CANDIDATE_VERSION, inputHash: snapshot.inputHash, summary, elements, rows, questions,
  })
  return { candidate, candidateSha256: await sha256(new Uint8Array(bytes)) }
}

export type CellSource = {
  fileName: string; recordIndex: number; column: RequiredColumn
  label: '原始输入' | '本地用户修改' | '待补充'
  originalValue: string | null; currentValue: string | null; modifications: Modification[]
}
export function cellSource(snapshot: InputSnapshot, recordIndex: number, name: RequiredColumn): CellSource {
  if (!Number.isSafeInteger(recordIndex) || recordIndex < 1 || recordIndex > snapshot.rows.length)
    reject('recordIndex', '数据记录序号越界')
  const columnIndex = snapshot.draft.original.columnIndex[name]
  if (columnIndex === undefined) return { fileName: snapshot.draft.fileName, recordIndex, column: name,
    label: '待补充', originalValue: null, currentValue: null, modifications: [] }
  const modifications = snapshot.draft.modifications
    .filter(edit => edit.recordIndex === recordIndex && edit.columnIndex === columnIndex)
    .map(edit => ({ ...edit }))
  return { fileName: snapshot.draft.fileName, recordIndex, column: name,
    label: modifications.length ? '本地用户修改' : '原始输入',
    originalValue: snapshot.draft.original.rows[recordIndex - 1]?.[columnIndex] ?? '',
    currentValue: snapshot.rows[recordIndex - 1]?.[columnIndex] ?? '', modifications }
}
