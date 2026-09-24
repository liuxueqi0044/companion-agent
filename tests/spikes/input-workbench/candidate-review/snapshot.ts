import { currentIssues, currentRows } from '../draft'
import { exportDraftBytes, importDraftBytes } from '../draft-io'
import { DraftInputError, strictDecode, type InputDraft } from '../model'
import { INPUT_VERSION, type InputSnapshot } from './types'

const LIMIT = 10 * 1024 * 1024
export function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes)
  return 'sha256:' + hex(await globalThis.crypto.subtle.digest('SHA-256', copy))
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

/** A content binding for one exported draft, including every local edit. Not an identity or signature. */
export async function prepareSnapshot(source: InputDraft): Promise<InputSnapshot> {
  const originalBytes = Uint8Array.from(await exportDraftBytes(source))
  const inputHash = await sha256(originalBytes)
  const isolated = await importDraftBytes(originalBytes.buffer)
  const rows = currentRows(isolated)
  const issues = currentIssues(isolated)
  return {
    version: INPUT_VERSION, inputHash,
    draft: deepFreeze(isolated), draftJson: strictDecode(originalBytes.buffer),
    rows: deepFreeze(rows), issues: deepFreeze(issues),
  }
}

export function exportSnapshotBytes(snapshot: InputSnapshot): Uint8Array {
  const wrapper = { version: INPUT_VERSION, inputHash: snapshot.inputHash,
    draft: JSON.parse(snapshot.draftJson) as unknown }
  const bytes = new TextEncoder().encode(JSON.stringify(wrapper, null, 2))
  if (bytes.byteLength > LIMIT) throw new DraftInputError('size', '输入快照 JSON 超过 10 MiB。')
  return bytes
}
