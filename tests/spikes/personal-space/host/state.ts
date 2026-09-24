export type TaskSnapshot = { id: string; bound_revision: string | null; status: 'unavailable' | 'idle' | 'running' }
export type StableRecord = { schema: 1; personal_ai_id: string; session_id: string; draft: string;
  tasks: TaskSnapshot[]; active_revision: string | null; history: string[] }
export type Candidate = { revision_id: string; base_revision: string | null; artifact_hash: string;
  source_type: 'handwritten_fixture' | 'model_candidate' }
export type Ready = { revision_id: string; base_revision: string | null; artifact_hash: string; request_id: string }
export type Phase = 'active' | 'preparing' | 'waiting_ready' | 'failed' | 'cancelled' | 'recovery'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const HASH = /^[a-f0-9]{64}$/
const KEY = 'personal-space-spike/1/stable'
const bytes = (value: string) => new TextEncoder().encode(value).length
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fields = (v: Record<string, unknown>, names: string[]) => Object.keys(v).sort().join('|') === names.sort().join('|')

export function parseRecord(raw: string): StableRecord {
  if (bytes(raw) > 20 * 1024) throw new Error('record_too_large')
  const v: unknown = JSON.parse(raw)
  if (!object(v) || !fields(v, ['schema','personal_ai_id','session_id','draft','tasks','active_revision','history'])
    || v.schema !== 1 || typeof v.personal_ai_id !== 'string' || !ID.test(v.personal_ai_id)
    || typeof v.session_id !== 'string' || !ID.test(v.session_id)
    || typeof v.draft !== 'string' || bytes(v.draft) > 8192
    || !(v.active_revision === null || (typeof v.active_revision === 'string' && ID.test(v.active_revision)))
    || !Array.isArray(v.history) || v.history.length > 20
    || v.history.some(x => typeof x !== 'string' || !ID.test(x))
    || !Array.isArray(v.tasks) || v.tasks.length > 8 || v.tasks.some(t => !object(t)
      || !fields(t, ['id','bound_revision','status']) || typeof t.id !== 'string' || !ID.test(t.id)
      || !(t.bound_revision === null || (typeof t.bound_revision === 'string' && ID.test(t.bound_revision)))
      || !['unavailable','idle','running'].includes(String(t.status)))) throw new Error('invalid_record')
  return v as StableRecord
}
export function seedRecord(): StableRecord {
  return { schema:1, personal_ai_id:'demo-personal-ai', session_id:'demo-session', draft:'',
    tasks:[{ id:'demo-task', bound_revision:null, status:'unavailable' }], active_revision:null, history:[] }
}
export class StableHost {
  record: StableRecord
  phase: Phase = 'active'
  recoveryReason: string | null = null
  private generation = 0
  private pending: string | null = null
  constructor(private readonly storage: Storage, private readonly key = KEY,
    private readonly knownRevisions: ReadonlySet<string> | null = null) {
    try {
      const raw = storage.getItem(key)
      this.record = raw === null ? seedRecord() : parseRecord(raw)
      if (knownRevisions && (this.record.active_revision && !knownRevisions.has(this.record.active_revision)
        || this.record.history.some(r => !knownRevisions.has(r)))) throw new Error('unknown_revision')
    } catch {
      this.record = seedRecord(); this.phase = 'recovery'; this.recoveryReason = 'stored_state_invalid'
    }
  }
  private commit(next: StableRecord) {
    const raw = JSON.stringify(next)
    parseRecord(raw)
    this.storage.setItem(this.key, raw) // A single record is the commit point.
    this.record = next
  }
  writeDraft(draft: string) {
    if (typeof draft !== 'string' || bytes(draft) > 8192) throw new Error('draft_invalid')
    this.commit({ ...this.record, draft })
  }
  cancel() { this.generation++; this.pending = null; this.phase = 'cancelled' }
  async activate(candidate: Candidate, prepare: (request_id: string) => Promise<Ready>, timeoutMs = 3000): Promise<string> {
    return this.transition('activate', candidate, prepare, timeoutMs)
  }
  async restorePrevious(candidate: Candidate, prepare: (request_id: string) => Promise<Ready>, timeoutMs = 3000): Promise<string> {
    return this.transition('restore', candidate, prepare, timeoutMs)
  }
  async recoverCurrent(candidate: Candidate, prepare: (request_id: string) => Promise<Ready>, timeoutMs = 3000): Promise<string> {
    return this.transition('recover', candidate, prepare, timeoutMs)
  }
  private async transition(mode: 'activate' | 'restore' | 'recover', candidate: Candidate,
    prepare: (request_id: string) => Promise<Ready>, timeoutMs: number): Promise<string> {
    if (candidate.source_type !== 'handwritten_fixture') return 'untrusted_execution_unavailable'
    if (this.knownRevisions && !this.knownRevisions.has(candidate.revision_id)) return 'revision_unavailable'
    if (!ID.test(candidate.revision_id) || !HASH.test(candidate.artifact_hash)
      || !(candidate.base_revision === null || ID.test(candidate.base_revision))) return 'candidate_invalid'
    const generation = ++this.generation
    const request_id = crypto.randomUUID()
    this.pending = request_id
    const starting = this.record.active_revision
    if (candidate.base_revision !== starting) { this.phase = 'failed'; this.pending = null; return 'stale_base' }
    if (mode === 'restore' && this.record.history.at(-1) !== candidate.revision_id) {
      this.phase = 'failed'; this.pending = null; return 'no_previous_revision'
    }
    if (mode === 'recover' && starting !== candidate.revision_id) {
      this.phase = 'failed'; this.pending = null; return 'no_known_active'
    }
    this.phase = 'preparing'
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      this.phase = 'waiting_ready'
      const proof = await Promise.race([
        prepare(request_id),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) }),
      ])
      if (generation !== this.generation || this.pending !== request_id) return 'superseded'
      if (proof.request_id !== request_id || proof.revision_id !== candidate.revision_id
        || proof.base_revision !== candidate.base_revision || proof.artifact_hash !== candidate.artifact_hash
        || this.record.active_revision !== starting) { this.phase = 'failed'; return 'ready_mismatch' }
      try {
        if (mode === 'activate') this.commit({ ...this.record, active_revision:candidate.revision_id,
          history: starting ? [...this.record.history, starting].slice(-20) : this.record.history })
        if (mode === 'restore') this.commit({ ...this.record, active_revision:candidate.revision_id,
          history:this.record.history.slice(0, -1) })
      } catch { this.phase = 'failed'; return 'commit_failed' }
      this.phase = 'active'
      return mode === 'activate' ? 'active' : mode === 'restore' ? 'restored' : 'recovered'
    } catch (error) {
      if (generation !== this.generation) return 'superseded'
      this.phase = 'failed'
      return error instanceof Error && error.message === 'timeout' ? 'timeout' : 'prepare_failed'
    } finally {
      if (timer) clearTimeout(timer)
      if (generation === this.generation) this.pending = null
    }
  }
  stop() { this.cancel(); return 'stopped' }
  snapshot() { return structuredClone(this.record) }
}
