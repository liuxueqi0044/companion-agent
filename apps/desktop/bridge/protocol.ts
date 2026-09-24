/** Shared, browser-safe transport types. Business payloads remain Python-owned JSON. */
export const VERSION = 'desktop-local/1' as const
export const ACTIONS = [
  'bootstrap', 'profile.read', 'profile.change', 'profile.undo',
  'task.submit', 'task.get', 'task.list', 'task.events', 'task.result',
  'task.cancel', 'task.retry', 'worker.run-next', 'worker.recover',
] as const
export type Action = typeof ACTIONS[number]
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Payload = Record<string, JsonValue>
export type BridgeReply =
  | { kind: 'success'; requestId: string; result: JsonValue }
  | { kind: 'business_error'; requestId: string; code: string }
  | { kind: 'transport_error'; requestId: string; code: 'unavailable' | 'protocol_error' | 'outcome_unknown'; cause: string }
export interface BridgePort {
  invoke(action: Action, payload: Payload): Promise<BridgeReply>
}
