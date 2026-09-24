import Papa from 'papaparse'
import { DraftInputError, LIMITS, REQUIRED_COLUMNS, utf8Bytes,
  type CsvSnapshot, type Issue, type RequiredColumn } from './model'

function validateShape(headers: string[], rows: string[][]): void {
  if (!headers.length || headers.every(value => value === ''))
    throw new DraftInputError('headers', 'CSV 需要非空表头。')
  if (headers.length > LIMITS.columns) throw new DraftInputError('columns', 'CSV 超过 100 列。')
  if (headers.some(value => value.trim() === '')) throw new DraftInputError('headers', 'CSV 有空表头，请先补全。')
  if (new Set(headers).size !== headers.length) throw new DraftInputError('headers', 'CSV 有重复表头，请先区分列名。')
  if (rows.length > LIMITS.records) throw new DraftInputError('records', 'CSV 超过 2000 条数据记录。')
  for (const [index, row] of rows.entries()) {
    if (row.length !== headers.length) throw new DraftInputError('width', `第 ${index + 1} 条数据的列数与表头不一致。`)
  }
  for (const cell of [...headers, ...rows.flat()]) {
    if (utf8Bytes(cell) > LIMITS.cellBytes) throw new DraftInputError('cell', 'CSV 有单元格超过 16 KiB。')
  }
}

export function analyzeRows(headers: string[], rows: string[][]): Issue[] {
  const issues: Issue[] = []
  for (const name of REQUIRED_COLUMNS) {
    const columnIndex = headers.indexOf(name)
    if (columnIndex < 0) {
      issues.push({ code: 'missing_column', column: name, recordIndex: null,
        message: `缺少 ${name} 整列；请在原表补齐后重新核对。` })
      continue
    }
    rows.forEach((row, index) => {
      const value = row[columnIndex] ?? ''
      if (value.trim() === '') {
        issues.push({ code: 'empty_value', column: name, recordIndex: index + 1,
          message: `第 ${index + 1} 条数据的 ${name} 为空，待补充。` })
      } else if ((name === 'qty' || name === 'unit_price') && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
        issues.push({ code: 'format', column: name, recordIndex: index + 1,
          message: `第 ${index + 1} 条数据的 ${name} 格式需人工核对。` })
      } else if (name === 'currency' && !/^[A-Z]{3}$/.test(value)) {
        issues.push({ code: 'format', column: name, recordIndex: index + 1,
          message: `第 ${index + 1} 条数据的 currency 应为原表明确写出的三位大写代码。` })
      }
    })
  }
  return issues
}

export function parseCsv(csvText: string, fileName: string): CsvSnapshot {
  if (utf8Bytes(csvText) > LIMITS.csvBytes) throw new DraftInputError('size', 'CSV 超过 2 MiB。')
  if (!csvText.trim()) throw new DraftInputError('csv_missing', '请粘贴或选择 CSV。')
  // header:false keeps duplicate/blank header cells visible; dynamicTyping:false keeps 0 and IDs as strings.
  const parsed = Papa.parse<string[]>(csvText, { delimiter: ',', header: false, dynamicTyping: false,
    skipEmptyLines: false, quoteChar: '"', escapeChar: '"' })
  if (parsed.errors.length) throw new DraftInputError('syntax', `CSV 语法或结构错误：${parsed.errors[0]?.code ?? 'unknown'}。`)
  const [headers, ...parsedRows] = parsed.data
  if (!headers) throw new DraftInputError('headers', 'CSV 需要表头。')
  // Papa represents a single final record terminator as [""]. It is not a data record.
  const rows = /[\r\n]$/.test(csvText) && parsedRows.at(-1)?.length === 1
    && parsedRows.at(-1)?.[0] === '' ? parsedRows.slice(0, -1) : parsedRows
  validateShape(headers, rows)
  const columnIndex: Partial<Record<RequiredColumn, number>> = {}
  for (const column of REQUIRED_COLUMNS) {
    const index = headers.indexOf(column)
    if (index >= 0) columnIndex[column] = index
  }
  return { headers, rows, columnIndex, sourceSummary: { fileName, records: rows.length, columns: headers.length } }
}
