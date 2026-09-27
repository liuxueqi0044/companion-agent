/** Trusted Node host only. Never import into a generated page or renderer bundle. */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const BOOT = String.raw`import sys,json
from pathlib import Path
workspace,root=map(Path,sys.argv[1:3])
sys.path.insert(0,str(workspace))
import services
assert Path(services.__file__).resolve().parent==workspace.resolve()/'services','wrong_import_root'
from services.product.entry import handle
from services.product.kernel import ProductKernel
sys.stdout.buffer.write(handle(sys.stdin.buffer.read(393217),ProductKernel(root),reviewed_packages=json.loads(sys.argv[3])))
`
const READS = new Set(['tool.list','tool.read','artifact.read','artifact.download','inbox.latest','home','policy.read','memory.list','contact.controls','contact.inspect','inbox.list',
  'inbox.explain','turn.read','events','task.get','task.result','task.events','experience.history',
  'conversation.list','conversation.turns','reminder.read','reminder.list','contact.read'])
const ACTIONS = new Set([...READS, 'tool.manage','bootstrap','policy.replace','turn.submit','turn.begin','turn.advance','turn.accept',
  'turn.respond','turn.execute','turn.revoke','turn.stop','turn.fail-generation',
  'memory.add','memory.edit','memory.forget','memory.clear','contact.cancel',
  'contact.block-topic','contact.unblock-topic','contact.tick','reminder.create','reminder.read','reminder.list','reminder.revise',
  'contact.claim','contact.complete','contact.fail-generation','reminder.deliver-due',
  'conversation.list','conversation.turns','reminder.cancel','inbox.read','runtime.recover','runtime.migrate',
  'worker.run-next','worker.recover','tasks.sync','task.cancel','task.retry','experience.activate','experience.restore'])
for(const name of ['list','read','definition','sets']){READS.add('capability.'+name);ACTIONS.add('capability.'+name)}
for(const name of ['import','manage','connected','grant','claim','reject','finish','save-set','apply-set'])ACTIONS.add('capability.'+name)

/** Options are application-owned, not values accepted from messages or package manifests. */
export function createProductHost({ python, workspace, dataRoot, reviewedPackages = [], timeoutMs = 30000, disposeTimeoutMs = 2000 }) {
  for (const entry of [python,workspace,dataRoot]) if (!path.isAbsolute(entry)) throw new Error('absolute_configuration_required')
  const children = new Set()
  let disposed = false
  async function request(action, payload = {}) {
    if (disposed) return { ok:false,error:{code:'disposed'} }
    if (!ACTIONS.has(action)) return { ok:false,error:{code:'unsupported_action'} }
    const requestId = randomUUID()
    let input
    try { input = JSON.stringify({version:'product-core/1',request_id:requestId,action,payload}) }
    catch { return {ok:false,error:{code:'invalid_request'}} }
    if (Buffer.byteLength(input) > 384 * 1024) return {ok:false,error:{code:'request_too_large'}}
    return new Promise(resolve => {
      let sent = false
      const child = execFile(python,['-I','-B','-c',BOOT,workspace,dataRoot,JSON.stringify(reviewedPackages)],
        {cwd:workspace,windowsHide:true,shell:false,encoding:'buffer',timeout:timeoutMs,maxBuffer:1024*1024},
        (error,stdout,stderr) => {
          if (error || stderr.length) {
            resolve({ok:false,error:{code:sent && !READS.has(action) ? 'outcome_unknown' : 'transport_unavailable'}})
            return
          }
          try {
            const text = new TextDecoder('utf-8',{fatal:true}).decode(stdout)
            if (!text.endsWith('\n') || text.indexOf('\n') !== text.length - 1) throw new Error('framing')
            const reply = JSON.parse(text)
            if (reply.version !== 'product-core/1' || reply.request_id !== requestId || typeof reply.ok !== 'boolean'
              || (reply.ok ? reply.error !== null : !/^[a-z][a-z0-9_]{0,63}$/.test(reply.error?.code))) throw new Error('envelope')
            resolve(reply)
          } catch { resolve({ok:false,error:{code:READS.has(action) ? 'protocol_error' : 'outcome_unknown'}}) }
        })
      children.add(child)
      child.once('close',() => children.delete(child))
      // execFile owns output collection; the host still handles input/output stream error events.
      const stop = () => { if (child.exitCode === null) child.kill() }
      for (const stream of [child.stdin,child.stdout,child.stderr]) stream?.on('error',stop)
      child.once('close',() => { for (const stream of [child.stdin,child.stdout,child.stderr]) stream?.removeListener('error',stop) })
      if (child.stdin) { sent = true; child.stdin.end(input) }
    })
  }
  return {
    request,
    async dispose() {
      disposed = true
      const closing = [...children].map(child => new Promise(resolve => {
        child.once('close',resolve)
        child.kill()
      }))
      let timer
      await Promise.race([Promise.all(closing),new Promise(resolve => {timer=setTimeout(resolve,disposeTimeoutMs)})])
      clearTimeout(timer)
      return {closed:children.size===0,activeProcesses:children.size}
    },
    get activeProcesses() { return children.size },
  }
}
