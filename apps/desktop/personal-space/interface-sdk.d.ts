/** Public browser surface, morrow.ui/1. Runtime and auth objects are intentionally absent. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Reply<T=unknown> = {ok:true;result?:T} | {ok:false;error:string};
export type Scope='conversation'|'tasks'|'memory'|'preferences'|'inbox'|'reminders'|'window';
export interface InterfaceSource {
  sdk:'morrow.ui/1'; id:string; name:string; entry:string; styles:string[];
  scopes:Scope[]; files:Record<string,string>;
}
export interface TurnInput {command_id:string;conversation_id:string;text:string;csv_text?:string|null;temporary?:boolean}
export interface TaskBinding {turnId:string;taskId:string;attemptId:string|null}
export interface RunBinding {turnId:string;runId:string}
export interface Draft {text?:string;conversationId?:string;selectedTurn?:string|null;temporary?:boolean;attachment?:{name:string;text:string}|null}
export interface Versioned<T> {revision:number;value:T}
export interface Page<T> {items:T[];snapshot:number;next_before:number|null}
export interface GoalCheck {criterion:number;passed:boolean;reason:string;evidence_ids:string[]}
export interface GoalTask {id:string;title:string;criteria:string[];depends_on:string[];state:'queued'|'working'|'submitted'|'accepted'|'rework';attempt:number;executor:'worker'|'claude';summary:string;evidence_ids:string[];checks:GoalCheck[]}
export interface Goal {version:1;phase:'planning'|'dispatching'|'working'|'reviewing'|'finished'|'cancelled';role:'director'|'worker'|'reviewer';active_task:string|null;outcome:string|null;tasks:GoalTask[]}
export interface WorkflowStep {ordinal:number;state:'generating'|'accepted'|'failed';reply:string|null;summary:string|null;action_ids:string[];error:string|null;created_at:string;role?:'director'|'worker'|'reviewer';task_id?:string|null;executor?:string}
export interface Workflow {version:1;step_count:number;plan:string[];steps:WorkflowStep[];has_more_steps:boolean;outcome:'complete'|'needs_input'|'incomplete'|null;pause_reason:string|null;next:'continue'|'none';can_continue:boolean;goal?:Goal}
export interface Turn {id:string;conversation_id:string;text:string;state:string;reply:string|null;provider_summary?:string|null;temporary:boolean;actions:unknown[];workflow?:Workflow|null}
export interface Snapshot {
  epoch:string;revision:number;
  interface:{revision:string;preview:boolean;sdk:'morrow.ui/1'};
  view:Record<string,unknown>;connection:Record<string,unknown>;progress:unknown;
}
export interface Client {
  version:'morrow.ui/1';start():Promise<void>;dispose():void;
  call(action:string,args?:Record<string,unknown>):Promise<Reply>;
  subscribe(listener:(snapshot:Snapshot)=>void):()=>void;
  conversation:{
    list(args?:{before?:number;limit?:number}):Promise<Reply<Page<unknown>>>;
    turns(args:{conversationId:string;before?:number;limit?:number}):Promise<Reply<Page<unknown>>>;
    get(args:{turnId:string}):Promise<Reply<Turn>>;
    send(args:TurnInput):Promise<Reply<{turnId:string}>>;
  };
  tasks:{get(args:TaskBinding):Promise<Reply>;result(args:TaskBinding):Promise<Reply>;stop(args:RunBinding):Promise<Reply>};
  artifacts:{read(args:{turnId:string;actionId:string}):Promise<Reply>;download(args:{turnId:string;actionId:string}):Promise<Reply<{name:string;mime:string;base64:string;sha256:string}>>};
  tools:{list():Promise<Reply>;read(args:{toolId:string}):Promise<Reply>;manage(args:{command_id:string;tool_id:string;expected_revision:number;operation:'enable'|'disable'|'restore';version?:number}):Promise<Reply>};
  draft:{read():Promise<Reply<Versioned<Draft>>>;write(args:{expectedRevision:number;value:Draft}):Promise<Reply<Versioned<Draft>>>};
  state:{read():Promise<Reply<Versioned<Record<string,Json>>>>;write(args:{expectedRevision:number;value:Record<string,Json>}):Promise<Reply<Versioned<Record<string,Json>>>>};
  host:{openRecovery():Promise<Reply>;openCapabilities():Promise<Reply>;configureWindow(settings:{width?:number;height?:number;frame?:boolean;transparent?:boolean;alwaysOnTop?:boolean;opacity?:number}):Promise<Reply>};
}
export function createClient(options?:{onSnapshot?:(s:Snapshot)=>void;onConnection?:(connected:boolean)=>void}):Client;
