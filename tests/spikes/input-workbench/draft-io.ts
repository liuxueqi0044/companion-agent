import { createDraft, saveModification } from './draft'
import { DraftInputError, LIMITS, VERSION, strictDecode, utf8Bytes, type InputDraft } from './model'

type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')

async function sha256(value: string): Promise<string> {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

export async function exportDraftBytes(draft: InputDraft): Promise<Uint8Array> {
  const data = {
    version: VERSION,
    requirementText: draft.requirementText,
    csvText: draft.csvText,
    fileName: draft.fileName,
    requirementSha256: await sha256(draft.requirementText),
    csvSha256: await sha256(draft.csvText),
    modifications: draft.modifications.map(edit => ({ recordIndex: edit.recordIndex,
      columnIndex: edit.columnIndex, header: edit.header, oldValue: edit.oldValue,
      newValue: edit.newValue, source: '用户修改' as const })),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2))
  if (bytes.byteLength > LIMITS.draftBytes) throw new DraftInputError('size', '草稿 JSON 超过 8 MiB。')
  return bytes
}

export async function importDraftBytes(bytes: ArrayBuffer): Promise<InputDraft> {
  if (bytes.byteLength > LIMITS.draftBytes) throw new DraftInputError('size', '草稿 JSON 超过 8 MiB。')
  let value: unknown
  try { value = JSON.parse(strictDecode(bytes)) as unknown }
  catch (error) {
    if (error instanceof DraftInputError) throw error
    throw new DraftInputError('json', '草稿 JSON 格式无效。')
  }
  if (!object(value) || value.version !== VERSION || typeof value.requirementText !== 'string'
      || typeof value.csvText !== 'string' || typeof value.fileName !== 'string'
      || typeof value.requirementSha256 !== 'string' || typeof value.csvSha256 !== 'string'
      || !Array.isArray(value.modifications) || value.modifications.length > LIMITS.modifications)
    throw new DraftInputError('structure', '草稿版本或结构无效。')
  if (utf8Bytes(value.requirementText) > LIMITS.requirementBytes || utf8Bytes(value.csvText) > LIMITS.csvBytes)
    throw new DraftInputError('size', '草稿中的原始输入超出限制。')
  if (await sha256(value.requirementText) !== value.requirementSha256
      || await sha256(value.csvText) !== value.csvSha256)
    throw new DraftInputError('digest', '原始内容 SHA-256 不匹配；草稿未打开。')
  let draft = createDraft(value.requirementText, value.csvText, value.fileName)
  for (const raw of value.modifications as unknown[]) {
    if (!object(raw) || !Number.isInteger(raw.recordIndex) || !Number.isInteger(raw.columnIndex)
        || typeof raw.header !== 'string' || typeof raw.oldValue !== 'string'
        || typeof raw.newValue !== 'string' || raw.source !== '用户修改'
        || raw.oldValue === raw.newValue)
      throw new DraftInputError('edit', '草稿修改记录无效。')
    const recordIndex = raw.recordIndex as number
    const columnIndex = raw.columnIndex as number
    if (recordIndex < 1 || recordIndex > draft.original.rows.length || columnIndex < 0
        || columnIndex >= draft.original.headers.length
        || draft.original.headers[columnIndex] !== raw.header
        || draft.original.rows[recordIndex - 1] === undefined)
      throw new DraftInputError('edit_coordinate', '草稿修改位置越界。')
    const current = draft.modifications.length ? currentValue(draft, recordIndex, columnIndex)
      : draft.original.rows[recordIndex - 1]![columnIndex]
    if (current !== raw.oldValue) throw new DraftInputError('edit_chain', '草稿修改的原值链不一致。')
    draft = saveModification(draft, recordIndex, columnIndex, raw.newValue)
  }
  return draft
}

function currentValue(draft: InputDraft, recordIndex: number, columnIndex: number): string | undefined {
  let value = draft.original.rows[recordIndex - 1]?.[columnIndex]
  for (const edit of draft.modifications) {
    if (edit.recordIndex === recordIndex && edit.columnIndex === columnIndex) value = edit.newValue
  }
  return value
}
