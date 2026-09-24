import { DraftInputError, LIMITS, VERSION, utf8Bytes, type InputDraft, type Issue,
  type Modification, type RequiredColumn } from './model'
import { analyzeRows, parseCsv } from './parse-csv'

export function createDraft(requirementText: string, csvText: string, fileName: string): InputDraft {
  if (requirementText.trim() === '') throw new DraftInputError('requirement_missing', '请先填写需求原文。')
  if (utf8Bytes(requirementText) > LIMITS.requirementBytes)
    throw new DraftInputError('size', '需求原文超过 64 KiB，原草稿未改变。')
  if (csvText.trim() === '') throw new DraftInputError('csv_missing', '请粘贴或选择 CSV。')
  const original = parseCsv(csvText, fileName)
  return { version: VERSION, requirementText, csvText, fileName, original, modifications: [] }
}

export function currentRows(draft: InputDraft): string[][] {
  const rows = draft.original.rows.map(row => [...row])
  for (const edit of draft.modifications) {
    const row = rows[edit.recordIndex - 1]
    if (row) row[edit.columnIndex] = edit.newValue
  }
  return rows
}

export function currentIssues(draft: InputDraft): Issue[] {
  return analyzeRows(draft.original.headers, currentRows(draft))
}

/** Missing whole columns are null; present but empty cells remain the original empty string. */
export function requiredCellValue(draft: InputDraft, recordIndex: number,
  column: RequiredColumn): string | null {
  const index = draft.original.columnIndex[column]
  if (index === undefined) return null
  return currentRows(draft)[recordIndex - 1]?.[index] ?? null
}

export function saveModification(draft: InputDraft, recordIndex: number, columnIndex: number,
  newValue: string): InputDraft {
  if (!Number.isInteger(recordIndex) || recordIndex < 1 || recordIndex > draft.original.rows.length
      || !Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= draft.original.headers.length)
    throw new DraftInputError('coordinate', '选中的数据位置无效。')
  if (utf8Bytes(newValue) > LIMITS.cellBytes) throw new DraftInputError('cell', '单元格超过 16 KiB。')
  const oldValue = currentRows(draft)[recordIndex - 1]?.[columnIndex]
  if (oldValue === undefined) throw new DraftInputError('coordinate', '选中的数据位置无效。')
  if (oldValue === newValue) return draft
  if (draft.modifications.length >= LIMITS.modifications)
    throw new DraftInputError('modifications', '本草稿已有 200 次修改；请导出后重新开始。')
  const edit: Modification = { recordIndex, columnIndex, header: draft.original.headers[columnIndex]!,
    oldValue, newValue, source: '用户修改' }
  return { ...draft, modifications: [...draft.modifications, edit] }
}

export function undoLast(draft: InputDraft): InputDraft {
  if (!draft.modifications.length) return draft
  return { ...draft, modifications: draft.modifications.slice(0, -1) }
}

export function clearModifications(draft: InputDraft): InputDraft {
  if (!draft.modifications.length) return draft
  return { ...draft, modifications: [] }
}
