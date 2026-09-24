/** Fixed, fictional presentation data. Replace DemoAdapter at the composition edge. */
export type DemoState = 'waiting_user' | 'running' | 'cancelling' | 'cancelled' | 'interrupted' | 'completed' | 'loading' | 'empty' | 'error'
export type TaskId = 'missing' | 'normal'
export type SourceKind = 'input' | 'user_confirmation' | 'calculation' | 'pending'

export interface DemoLine {
  id: string
  label: string
  unit: string
  quantity: number
  currency: 'USD' | 'EUR'
  unitCents: number | null
  quantitySource: string
  priceSource: string
  pendingReason?: string
}

export interface DemoTask {
  id: TaskId
  title: string
  customer: string
  description: string
  fixture: string
  lines: DemoLine[]
  questions: string[]
  taxBasis: string | null
}

export interface DemoAdapter {
  list(): { id: TaskId; title: string; caption: string }[]
  get(id: TaskId): DemoTask
}

const missing: DemoTask = {
  id: 'missing',
  title: '北海路演 · 询价明细',
  customer: '北海文旅（虚构）',
  description: '两场路演的技术支持、运输、加急排期与手册。价格表中有缺项与冲突，成果只能显示已知部分。',
  fixture: 'tests/fixtures/first-flow/missing.json · ff-missing-01',
  taxBasis: null,
  questions: ['物料运输单价缺失，币种为 EUR。', '加急排期费：需求文字 180.00 USD 与价格表 150.00 USD 冲突。', '单价是否含税尚未说明。'],
  lines: [
    { id: 'support', label: '现场技术支持', unit: '天', quantity: 2, currency: 'USD', unitCents: 95000, quantitySource: '需求文字与价格表第 2 行', priceSource: '价格表第 2 行：950.00 USD' },
    { id: 'transport', label: '物料运输', unit: '车次', quantity: 1, currency: 'EUR', unitCents: null, quantitySource: '需求文字与价格表第 3 行', priceSource: '价格表第 3 行：单价为空', pendingReason: '单价待确认' },
    { id: 'urgent', label: '加急排期费', unit: '项', quantity: 1, currency: 'USD', unitCents: null, quantitySource: '价格表第 4 行', priceSource: '需求文字 180.00 USD；价格表第 4 行 150.00 USD', pendingReason: '来源冲突，待确认' },
    { id: 'brochure', label: '展会手册（附赠）', unit: '本', quantity: 20, currency: 'USD', unitCents: 0, quantitySource: '需求文字与价格表第 5 行', priceSource: '价格表第 5 行：明确写为 0.00 USD' },
  ],
}

const normal: DemoTask = {
  id: 'normal',
  title: '青湾会展 · 询价明细',
  customer: '青湾会展（虚构）',
  description: '三项已知 USD 条目的演示结果。完成状态仅对应这个固定样本的确定性核算。',
  fixture: 'tests/fixtures/first-flow/normal.json · ff-normal-01',
  taxBasis: '需求文字明确：单价均为含税价',
  questions: [],
  lines: [
    { id: 'translation', label: '同声传译', unit: '天', quantity: 3, currency: 'USD', unitCents: 180000, quantitySource: '需求文字与价格表第 2 行', priceSource: '价格表第 2 行：1,800.00 USD' },
    { id: 'equipment', label: '耳返设备租赁', unit: '套', quantity: 2, currency: 'USD', unitCents: 12050, quantitySource: '需求文字与价格表第 3 行', priceSource: '价格表第 3 行：120.50 USD' },
    { id: 'bag', label: '会议资料袋', unit: '个', quantity: 50, currency: 'USD', unitCents: 240, quantitySource: '需求文字与价格表第 4 行', priceSource: '价格表第 4 行：2.40 USD' },
  ],
}

const tasks: Record<TaskId, DemoTask> = { missing, normal }

export const demoAdapter: DemoAdapter = {
  list: () => [
    { id: 'missing', title: missing.title, caption: '3 项待确认 · 虚构' },
    { id: 'normal', title: normal.title, caption: '固定完成样例 · 虚构' },
  ],
  get: (id) => tasks[id],
}

export function lineAmountCents(line: DemoLine): number | null {
  return line.unitCents === null ? null : line.quantity * line.unitCents
}

export function summarize(lines: DemoLine[]) {
  const byCurrency = new Map<string, { knownCents: number; knownLines: number; unknownLines: number }>()
  for (const line of lines) {
    const bucket = byCurrency.get(line.currency) ?? { knownCents: 0, knownLines: 0, unknownLines: 0 }
    const amount = lineAmountCents(line)
    if (amount === null) bucket.unknownLines += 1
    else {
      bucket.knownCents += amount
      bucket.knownLines += 1
    }
    byCurrency.set(line.currency, bucket)
  }
  return [...byCurrency].map(([currency, values]) => ({ currency, ...values, completeCents: values.unknownLines ? null : values.knownCents }))
}

export function parsePriceCents(raw: string): number | null {
  const value = raw.trim()
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, decimals = ''] = value.split('.')
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
}

export function money(cents: number | null, currency: string): string {
  if (cents === null) return `${currency} 待确认`
  return `${currency} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const stateDetails: Record<DemoState, { label: string; text: string; tone: string }> = {
  waiting_user: { label: '待你确认', text: '还有缺失与冲突字段；当前金额仅为已知部分。', tone: 'amber' },
  running: { label: '运行中 · 演示', text: '这只是固定状态样例，未连接执行器，也没有实际后台进度。', tone: 'sage' },
  cancelling: { label: '等待退出确认', text: '已记录取消请求；尚未收到任务退出事件，不能显示已取消。', tone: 'amber' },
  cancelled: { label: '已确认退出 · 样例', text: '独立的已退出状态样例；不是本页取消按钮的真实回执。', tone: 'muted' },
  interrupted: { label: '结果待核对', text: '连接状态未知，不能据此判断任务完成或退出。', tone: 'amber' },
  completed: { label: '完成 · 固定样例', text: '仅青湾固定样本：3 项 USD 行小计 5,400.00 + 241.00 + 120.00 = 5,761.00；含税依据见需求文字。', tone: 'sage' },
  loading: { label: '加载占位 · 演示', text: '正在呈现加载样例，无执行器连接。', tone: 'muted' },
  empty: { label: '空状态 · 演示', text: '此状态暂不显示成果；样本可通过状态控件恢复。', tone: 'muted' },
  error: { label: '读取失败 · 演示', text: '这是错误样例，原有演示数据仍在；可切换状态恢复。', tone: 'rose' },
}
