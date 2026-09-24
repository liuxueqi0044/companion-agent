/** Offline, deliberately narrow projection of Codex App Server 0.156.0 messages.
 * Field bindings: reports/evidence/M00.5.01/source-index.json, especially rpc.rs,
 * RequestId.ts, ServerRequest.ts, ServerNotification.ts and v2 Turn/Auth/RateLimit types.
 * No upstream payload is copied into an observation.
 */
export type Direction = 'client_to_server' | 'server_to_client';
export type RpcId = string | number;
export type PendingRequest = { id: RpcId; method: string; threadId?: string; turnId?: string; direction?: Direction };
export type ProjectionContext = {
  direction: Direction;
  threadId?: string;
  turnId?: string;
  pendingRequest?: PendingRequest;
  cancelRequested?: boolean;
};
export type Observation = {
  kind: 'request' | 'response' | 'notification' | 'approval_request' | 'invalid' | 'unknown';
  method: string | null;
  rpcId: RpcId | null;
  threadId: string | null;
  turnId: string | null;
  nativeStatus: 'inProgress' | 'completed' | 'interrupted' | 'failed' | null;
  productStatus: 'unverified';
  exitEvidence: boolean;
  cancelState: 'requested' | 'acknowledged' | null;
  approvalState: 'pending' | null;
  auth: { mode: 'apiKey' | 'chatgpt' | 'amazonBedrock' | 'other' | null; status: 'reported' | 'unavailable' | 'external_tokens_not_adopted' | 'unknown'; source: 'official_app_server' | 'none' };
  usage: { usedPercent: number | null; costAmount: null };
  issues: string[];
};

type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => v !== null && typeof v === 'object' && !Array.isArray(v);
const rpcId = (v: unknown): v is RpcId => typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v));
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const status = (v: unknown): v is NonNullable<Observation['nativeStatus']> =>
  v === 'inProgress' || v === 'completed' || v === 'interrupted' || v === 'failed';
const own = (v: RecordValue, k: string): boolean => Object.prototype.hasOwnProperty.call(v, k);

function blank(): Observation {
  return {
    kind: 'unknown', method: null, rpcId: null, threadId: null, turnId: null,
    nativeStatus: null, productStatus: 'unverified', exitEvidence: false,
    cancelState: null, approvalState: null,
    auth: { mode: null, status: 'unknown', source: 'none' },
    usage: { usedPercent: null, costAmount: null }, issues: [],
  };
}

function linked(params: RecordValue, ctx: ProjectionContext, out: Observation, needTurn: boolean): boolean {
  const thread = params.threadId;
  const turn = params.turnId;
  if (!nonempty(thread) || !nonempty(ctx.threadId) || thread !== ctx.threadId) {
    out.issues.push('thread_correlation_invalid');
    return false;
  }
  if (needTurn && (!nonempty(turn) || !nonempty(ctx.turnId) || turn !== ctx.turnId)) {
    out.issues.push('turn_correlation_invalid');
    return false;
  }
  out.threadId = thread;
  if (needTurn && nonempty(turn)) out.turnId = turn;
  return true;
}

function projectTurn(params: unknown, ctx: ProjectionContext, out: Observation, completed: boolean): void {
  if (!object(params) || !object(params.turn)) {
    out.issues.push('turn_payload_invalid'); return;
  }
  const turn = params.turn;
  if (!nonempty(params.threadId) || !nonempty(turn.id) || !nonempty(ctx.threadId)
      || !nonempty(ctx.turnId) || params.threadId !== ctx.threadId || turn.id !== ctx.turnId) {
    out.issues.push('turn_correlation_invalid'); return;
  }
  if (!status(turn.status) || (completed && turn.status === 'inProgress')) {
    out.issues.push('turn_status_invalid'); return;
  }
  out.threadId = params.threadId;
  out.turnId = turn.id;
  out.nativeStatus = turn.status;
  out.exitEvidence = completed && turn.status === 'interrupted';
}

function setAuthMode(raw: unknown, out: Observation): void {
  if (raw === 'chatgptAuthTokens') {
    out.auth = { mode: 'other', status: 'external_tokens_not_adopted', source: 'official_app_server' };
  } else if (raw === 'chatgpt' || raw === 'apiKey' || raw === 'apikey' || raw === 'amazonBedrock') {
    out.auth = { mode: raw === 'apikey' ? 'apiKey' : raw, status: 'reported', source: 'official_app_server' };
  } else if (raw === null) {
    out.auth = { mode: null, status: 'unavailable', source: 'official_app_server' };
  } else {
    out.auth = { mode: 'other', status: 'unknown', source: 'official_app_server' };
    out.issues.push('auth_mode_unsupported');
  }
}

function projectAccountRead(value: unknown, out: Observation): void {
  if (!object(value) || !own(value, 'account') || typeof value.requiresOpenaiAuth !== 'boolean') {
    out.issues.push('account_response_invalid'); return;
  }
  if (value.account === null) { setAuthMode(null, out); return; }
  if (!object(value.account) || typeof value.account.type !== 'string') {
    out.issues.push('account_type_invalid'); return;
  }
  if (!['apiKey', 'chatgpt', 'amazonBedrock'].includes(value.account.type)) {
    out.issues.push('account_type_unsupported'); return;
  }
  setAuthMode(value.account.type, out);
}

function projectAccountUpdated(value: unknown, out: Observation): void {
  if (!object(value) || !own(value, 'authMode')
      || (value.authMode !== null && typeof value.authMode !== 'string')) {
    out.issues.push('account_notification_invalid'); return;
  }
  setAuthMode(value.authMode, out);
}

function projectUsage(value: unknown, out: Observation): void {
  if (!object(value) || !object(value.rateLimits)) { out.issues.push('usage_payload_invalid'); return; }
  const primary = value.rateLimits.primary;
  if (primary === null) return;
  if (!object(primary) || typeof primary.usedPercent !== 'number' || !Number.isFinite(primary.usedPercent)
      || primary.usedPercent < 0 || primary.usedPercent > 100) {
    out.issues.push('usage_percent_invalid'); return;
  }
  out.usage.usedPercent = primary.usedPercent;
}

/** Projection never confirms product completion, executes an approval or stores a token. */
export function projectCodexMessage(decoded: unknown, ctx: ProjectionContext): Observation {
  const out = blank();
  if (!object(decoded)) { out.kind = 'invalid'; out.issues.push('envelope_invalid'); return out; }
  const hasMethod = own(decoded, 'method');
  const hasId = own(decoded, 'id');
  const hasResult = own(decoded, 'result');
  const hasError = own(decoded, 'error');
  if ((hasMethod && (hasResult || hasError)) || (hasResult && hasError)
      || (!hasMethod && !hasResult && !hasError)
      || (hasId && !rpcId(decoded.id)) || (hasMethod && !nonempty(decoded.method))
      || (!hasMethod && !hasId)) {
    out.kind = 'invalid'; out.issues.push('envelope_invalid'); return out;
  }
  if (hasId) out.rpcId = decoded.id as RpcId;
  if (hasMethod) {
    out.method = decoded.method as string;
    out.kind = hasId ? 'request' : 'notification';
    const params = decoded.params;
    const clientRequests = ['initialize', 'thread/start', 'turn/start', 'turn/interrupt',
      'account/read', 'account/rateLimits/read'];
    const clientNotifications = ['initialized'];
    const serverRequests = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'];
    const serverNotifications = ['turn/started', 'turn/completed', 'error', 'account/updated'];
    const method = out.method;
    const known = [...clientRequests, ...clientNotifications, ...serverRequests, ...serverNotifications];
    if (!known.includes(method)) { out.kind = 'unknown'; out.issues.push('method_unknown'); return out; }
    const allowed = ctx.direction === 'client_to_server'
      ? (hasId ? clientRequests : clientNotifications)
      : (hasId ? serverRequests : serverNotifications);
    if (!allowed.includes(method)) {
      out.kind = 'invalid';
      out.issues.push((ctx.direction === 'client_to_server'
        ? [...serverRequests, ...serverNotifications] : [...clientRequests, ...clientNotifications]).includes(method)
        ? 'method_direction_invalid' : 'method_category_invalid');
      return out;
    }
    if (ctx.direction === 'client_to_server') {
      if (hasId && out.method === 'turn/interrupt') {
        if (object(params) && linked(params, ctx, out, true)) out.cancelState = 'requested';
        else if (!object(params)) out.issues.push('interrupt_payload_invalid');
      }
      return out;
    }
    if (hasId) {
      if (out.method === 'item/commandExecution/requestApproval' || out.method === 'item/fileChange/requestApproval') {
        out.kind = 'approval_request';
        if (object(params) && nonempty(params.itemId) && linked(params, ctx, out, true)) {
          out.approvalState = 'pending';
        } else if (!object(params) || !nonempty(params.itemId)) out.issues.push('approval_payload_invalid');
      }
      return out;
    }
    if (out.method === 'turn/started' || out.method === 'turn/completed') {
      projectTurn(params, ctx, out, out.method === 'turn/completed');
    } else if (out.method === 'error') {
      if (!object(params) || !object(params.error) || typeof params.willRetry !== 'boolean'
          || !linked(params, ctx, out, true)) out.issues.push('native_error_payload_invalid');
      else out.issues.push(params.willRetry ? 'native_error_retrying' : 'native_error');
    } else if (out.method === 'account/updated') {
      projectAccountUpdated(params, out);
    }
    return out;
  }
  out.kind = 'response';
  const pending = ctx.pendingRequest;
  if (!pending || pending.id !== out.rpcId || !nonempty(pending.method)) {
    out.issues.push('request_correlation_invalid'); return out;
  }
  const pendingDirection = pending.direction ?? 'client_to_server';
  if (pendingDirection === ctx.direction) {
    out.kind = 'invalid'; out.issues.push('response_direction_invalid'); return out;
  }
  if (ctx.direction === 'client_to_server') {
    out.kind = 'unknown'; out.issues.push('approval_response_unsupported'); return out;
  }
  out.method = pending.method;
  if (hasError) {
    if (!object(decoded.error) || !Number.isInteger(decoded.error.code) || !nonempty(decoded.error.message)) {
      out.issues.push('rpc_error_invalid');
    } else out.issues.push('rpc_error');
    return out;
  }
  if (pending.method === 'initialize') {
    if (!object(decoded.result) || !nonempty(decoded.result.userAgent)) out.issues.push('initialize_response_invalid');
  } else if (pending.method === 'turn/interrupt') {
    if (!object(decoded.result)) { out.issues.push('interrupt_response_invalid'); return out; }
    if (!nonempty(pending.threadId) || !nonempty(pending.turnId)
        || pending.threadId !== ctx.threadId || pending.turnId !== ctx.turnId) {
      out.issues.push('turn_correlation_invalid'); return out;
    }
    out.threadId = pending.threadId; out.turnId = pending.turnId;
    out.cancelState = 'acknowledged';
  } else if (pending.method === 'turn/start') {
    if (!object(decoded.result) || !object(decoded.result.turn) || !nonempty(decoded.result.turn.id)
        || !status(decoded.result.turn.status) || !nonempty(pending.threadId)
        || pending.threadId !== ctx.threadId) {
      out.issues.push('turn_start_response_invalid'); return out;
    }
    out.threadId = pending.threadId;
    out.turnId = decoded.result.turn.id;
    out.nativeStatus = decoded.result.turn.status;
  } else if (pending.method === 'thread/start') {
    if (!object(decoded.result) || !object(decoded.result.thread) || !nonempty(decoded.result.thread.id)) {
      out.issues.push('thread_start_response_invalid'); return out;
    }
    out.threadId = decoded.result.thread.id;
  } else if (pending.method === 'account/read') projectAccountRead(decoded.result, out);
  else if (pending.method === 'account/rateLimits/read') projectUsage(decoded.result, out);
  else { out.kind = 'unknown'; out.issues.push('method_unknown'); }
  return out;
}
