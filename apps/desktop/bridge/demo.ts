/** Non-product, nonvisual demonstration against the fixed BATCH-016 development runtime. */
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { LocalTaskController } from './client/controller.js'
import { createDevelopmentBridge } from './host/bridge.js'
import type { BridgeReply, JsonValue } from './protocol.js'

function record(value: JsonValue): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid_result')
  return value
}
function success(reply: BridgeReply): Record<string, JsonValue> {
  if (reply.kind !== 'success') throw new Error(reply.kind === 'business_error' ? reply.code : reply.code)
  return record(reply.result)
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('no_demo_arguments')
  const host = createDevelopmentBridge(resolve(process.cwd()))
  const client = new LocalTaskController(host, { pollMs: 100 })
  try {
    success(await client.bootstrap())
    const previous = success(await host.invoke('task.list', { limit: 100 }))
    const items = previous.items
    if (!Array.isArray(items) || previous.next_before_task_id !== null ||
        items.some(item => typeof item === 'object' && item !== null && !Array.isArray(item) &&
          ['queued', 'running', 'cancelling'].includes(String(item.status)))) {
      throw new Error('development_runtime_has_pending_tasks')
    }
    const created = success(await client.submitTask({ command_id: randomUUID(),
      requirement_text: '虚构文具金额核对；仅执行固定 csv_audit/1。',
      csv_text: 'item,unit,qty,unit_price,currency\n笔,支,0.1,0.2,CNY\n' }))
    const task = record(created.task)
    if (typeof task.task_id !== 'string') throw new Error('invalid_task_id')
    success(await client.watchTask(task.task_id))
    const worked = success(await client.runNext())
    if (worked.task_id !== task.task_id) throw new Error('unexpected_task_processed')
    const page = success(await client.loadResultPage({ limit: 1 }))
    const rows = page.rows
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('invalid_result_page')
    const row = record(rows[0])
    const metadata = record(page.metadata)
    const output = {
      task_id: task.task_id,
      status: worked.status,
      amount: metadata.total,
      currency: metadata.total_currency,
      input_hash: metadata.input_hash,
      source_refs: row.source_refs,
      requirements_interpretation: metadata.requirements_interpretation,
    }
    process.stdout.write(JSON.stringify(output) + '\n')
  } finally {
    client.dispose()
    await host.dispose()
  }
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : 'demo_failed' }) + '\n')
  process.exitCode = 1
})
