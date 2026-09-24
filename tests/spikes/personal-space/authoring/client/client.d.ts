// Private space-client/1 author API. Host grants remain authoritative.
export type DemoTask = { id: string; bound_revision: string | null; status: 'unavailable' | 'idle' | 'running' }
export type DemoSnapshot = { draft: string; tasks: DemoTask[]; active_revision: string }
export type DemoBinding = { type: 'personal-space-init'; channel_id: string; revision_id: string;
  request_id: string; artifact_hash: string; base_revision: string | null }
export interface PersonalSpaceClient {
  connect(options?: { timeoutMs?: number }): Promise<DemoSnapshot>
  whenReady(options?: { timeoutMs?: number }): Promise<DemoSnapshot>
  snapshot(): DemoSnapshot | null
  subscribe(callback: (snapshot: DemoSnapshot) => void): () => void
  /** After a read timeout, reconnect and have the host recover its mount before reading again. */
  refresh(timeoutMs?: number): Promise<DemoSnapshot>
  saveDraft(draft: string, timeoutMs?: number): Promise<{ saved: true; revision_id: string }>
  status(): 'waiting_init' | 'waiting_active' | 'active' | 'closed'
  binding(): DemoBinding | null
  dispose(): void
  /** Resets this SDK object only; the host must explicitly re-mount via recover(). */
  reconnect(): PersonalSpaceClient
}
declare global { interface Window { PersonalSpace: PersonalSpaceClient } }
