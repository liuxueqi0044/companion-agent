export const VERSION = 'local-input-draft/1' as const
export const REQUIRED_COLUMNS = ['item', 'unit', 'qty', 'unit_price', 'currency'] as const
export type RequiredColumn = typeof REQUIRED_COLUMNS[number]
export const LIMITS = {
  requirementBytes: 64 * 1024,
  csvBytes: 2 * 1024 * 1024,
  records: 2000,
  columns: 100,
  cellBytes: 16 * 1024,
  draftBytes: 8 * 1024 * 1024,
  modifications: 200,
} as const

export type Issue = {
  code: 'missing_column' | 'empty_value' | 'format'
  column: string
  recordIndex: number | null
  message: string
}
export type CsvSnapshot = {
  headers: string[]
  rows: string[][]
  columnIndex: Partial<Record<RequiredColumn, number>>
  sourceSummary: { fileName: string; records: number; columns: number }
}
export type Modification = {
  recordIndex: number
  columnIndex: number
  header: string
  oldValue: string
  newValue: string
  source: '用户修改'
}
export type InputDraft = {
  version: typeof VERSION
  requirementText: string
  csvText: string
  fileName: string
  original: CsvSnapshot
  modifications: Modification[]
}

export class DraftInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DraftInputError'
  }
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function strictDecode(bytes: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new DraftInputError('encoding', '文件不是有效的 UTF-8，请转换编码后再选择。') }
}

export async function readSelectedText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new DraftInputError('size', '文件超出大小限制，原草稿未改变。')
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > maxBytes) throw new DraftInputError('size', '文件超出大小限制，原草稿未改变。')
  return strictDecode(bytes)
}
