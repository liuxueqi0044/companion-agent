<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { demoAdapter, lineAmountCents, money, parsePriceCents, stateDetails, summarize, type DemoLine, type DemoState, type TaskId } from './ui-preview-model'
import InputWorkbench from './input-workbench/InputWorkbench.vue'

const view = ref<'demo' | 'workbench'>('demo')
const activeId = ref<TaskId>('missing')
const state = ref<DemoState>('waiting_user')
const transportEditedCents = ref<number | null>(null)
const showNewValue = ref(true)
const auxiliaryOpen = ref(false)
const modal = ref<'source' | 'edit' | null>(null)
const sourceTitle = ref('')
const sourceText = ref('')
const priceInput = ref('')
const priceError = ref('')
const editInput = ref<HTMLInputElement | null>(null)
const dialogRoot = ref<HTMLElement | null>(null)
let invokingElement: HTMLElement | null = null

const task = computed(() => demoAdapter.get(activeId.value))
const lines = computed(() => task.value.lines.map(line => line.id === 'transport' && transportEditedCents.value !== null && showNewValue.value
  ? { ...line, unitCents: transportEditedCents.value, priceSource: '本页面用户确认的演示修订：' + money(transportEditedCents.value, 'EUR'), pendingReason: undefined }
  : line))
const totals = computed(() => summarize(lines.value))
const visibleQuestions = computed(() => task.value.questions.filter(q => !(q.startsWith('物料运输') && transportEditedCents.value !== null && showNewValue.value)))
const status = computed(() => activeId.value === 'normal' && state.value === 'waiting_user'
  ? { label: '待确认 · 状态样例', text: '这是独立待确认状态样例；当前青湾固定数据本身没有缺失字段。', tone: 'amber' }
  : stateDetails[state.value])
const showResult = computed(() => !['loading', 'empty', 'error'].includes(state.value))
const isComplete = computed(() => activeId.value === 'normal' && state.value === 'completed')

function chooseTask(id: TaskId) {
  activeId.value = id
  state.value = id === 'normal' ? 'completed' : 'waiting_user'
  transportEditedCents.value = null
  showNewValue.value = true
  auxiliaryOpen.value = false
}

function chooseState(event: Event) {
  const next = (event.target as HTMLSelectElement).value as DemoState
  state.value = next === 'completed' && activeId.value !== 'normal' ? 'waiting_user' : next
}

function requestCancel() {
  state.value = 'cancelling'
}

function resetDemo() {
  transportEditedCents.value = null
  showNewValue.value = true
  state.value = activeId.value === 'normal' ? 'completed' : 'waiting_user'
}

async function openSource(event: Event, line?: DemoLine) {
  invokingElement = event.currentTarget as HTMLElement
  if (line) {
    sourceTitle.value = `${line.label} · 来源`
    const amount = lineAmountCents(line)
    const priceKind = line.unitCents === null ? '待确认' : line.id === 'transport' && transportEditedCents.value !== null && showNewValue.value ? '用户确认（本地演示）' : '输入'
    sourceText.value = `输入来源 · 数量 ${line.quantity} ${line.unit}：${line.quantitySource}。${priceKind} · 单价：${line.priceSource}。${amount === null ? '待确认 · 小计未知，未以 0 占位。' : `确定性计算 · ${line.quantity} × ${money(line.unitCents, line.currency)} = ${money(amount, line.currency)}。`}`
  } else {
    sourceTitle.value = '汇总 · 来源'
    sourceText.value = '仅以当前可见明细的整数分相加，按币种分别显示。任何缺失或冲突都会使该币种完整总额保持未知；不同币种从不合算。'
  }
  modal.value = 'source'
  await nextTick()
  dialogRoot.value?.querySelector<HTMLElement>('button')?.focus()
}

async function openEdit(event: Event) {
  invokingElement = event.currentTarget as HTMLElement
  priceInput.value = transportEditedCents.value === null ? '' : (transportEditedCents.value / 100).toFixed(2)
  priceError.value = ''
  modal.value = 'edit'
  await nextTick()
  editInput.value?.focus()
}

async function closeModal() {
  modal.value = null
  await nextTick()
  if (invokingElement?.isConnected) invokingElement.focus()
  invokingElement = null
}

function saveEdit() {
  const cents = parsePriceCents(priceInput.value)
  if (cents === null) {
    priceError.value = '请输入非负金额，最多两位小数。'
    return
  }
  transportEditedCents.value = cents
  showNewValue.value = true
  void closeModal()
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void closeModal()
    return
  }
  if (event.key !== 'Tab') return
  const controls = [...(dialogRoot.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [])]
  if (!controls.length) return
  if (event.shiftKey && document.activeElement === controls[0]) {
    event.preventDefault()
    controls[controls.length - 1]?.focus()
  } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
    event.preventDefault()
    controls[0]?.focus()
  }
}
</script>

<template>
  <div class="preview-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><span>morrow</span><span class="brand-subtitle">/ 工作台小样</span></div>
      <span class="top-notice">离线演示 · 虚构资料 · 未连接执行器</span>
    </header>

    <div class="workspace" :class="{ 'workbench-layout': view === 'workbench' }">
      <aside class="sidebar" aria-label="演示导航">
        <div class="sidebar-overline">今天的空间</div>
        <div class="nav-current"><span aria-hidden="true">▦</span> 工作台</div>
        <div class="sidebar-heading">最近的演示任务 <span>02</span></div>
        <button v-for="item in demoAdapter.list()" :key="item.id" class="task-switch" :class="{ selected: activeId === item.id }" :aria-current="activeId === item.id ? 'page' : undefined" @click="chooseTask(item.id)">
          <span class="task-switch-icon" aria-hidden="true">{{ item.id === 'missing' ? '◷' : '✓' }}</span>
          <span><strong>{{ item.title }}</strong><small>{{ item.caption }}</small></span>
        </button>
        <div class="sidebar-bottom"><span class="quiet-dot" aria-hidden="true"></span><span>仅此页面的演示状态<br><small>不保存会话或记忆</small></span></div>
      </aside>

      <main class="main-column" id="main">
        <div class="eyebrow">工作台 <span aria-hidden="true">/</span> {{ view === 'demo' ? '成果演示' : '输入准备' }}</div>
        <div class="mode-switch" role="group" aria-label="工作台模式"><button type="button" :aria-pressed="view === 'demo'" @click="view = 'demo'">固定成果演示</button><button type="button" :aria-pressed="view === 'workbench'" @click="view = 'workbench'">准备我的输入</button></div>
        <KeepAlive><InputWorkbench v-if="view === 'workbench'" /></KeepAlive>
        <template v-if="view === 'demo'">
        <div class="intro-row">
          <div><p class="overline">当前演示任务</p><h1>{{ task.title }}</h1><p class="intro-text">{{ task.description }}</p></div>
          <span class="fiction-label">虚构样本</span>
        </div>

        <section class="status-card" aria-labelledby="status-title">
          <div class="status-copy"><span class="status-badge" :class="status.tone">{{ status.label }}</span><h2 id="status-title">{{ state === 'waiting_user' && activeId === 'missing' ? '还有几处，想与你一起确认。' : status.label }}</h2><p role="status" aria-live="polite">{{ status.text }}</p></div>
          <div class="status-actions"><label for="state-select">演示状态</label><select id="state-select" :value="state" @change="chooseState"><option value="waiting_user">待确认</option><option value="running">运行中样例</option><option value="cancelling">等待退出确认</option><option value="cancelled">已退出样例</option><option value="interrupted">断连 / 待核对</option><option value="completed" :disabled="activeId !== 'normal'">完成样例（仅完整样本）</option><option value="loading">加载样例</option><option value="empty">空状态样例</option><option value="error">错误样例</option></select><button v-if="state === 'running'" class="text-button" @click="requestCancel">请求取消</button></div>
        </section>

        <section v-if="!showResult" class="surface placeholder-card" aria-label="演示状态内容"><div class="placeholder-icon" aria-hidden="true">{{ state === 'error' ? '!' : state === 'empty' ? '○' : '◌' }}</div><h2>{{ status.label }}</h2><p>{{ status.text }}</p><button class="secondary-button" @click="resetDemo">返回当前样本</button></section>

        <template v-else>
          <section class="surface result-card" aria-labelledby="result-title">
            <div class="section-top"><div><p class="overline">可核对成果</p><h2 id="result-title">询价明细</h2></div><button class="source-link" @click="openSource($event)">查看汇总依据 <span aria-hidden="true">↗</span></button></div>
            <p class="result-caption">{{ task.customer }} · 来源：{{ task.fixture }}。所有金额均为演示资料。</p>
            <div v-if="transportEditedCents !== null && activeId === 'missing'" class="revision-bar"><span>运输单价已作本地演示修订</span><div role="group" aria-label="查看修订版本"><button :aria-pressed="!showNewValue" @click="showNewValue = false">原值</button><button :aria-pressed="showNewValue" @click="showNewValue = true">新值</button></div></div>
            <div class="table-wrap"><table><thead><tr><th scope="col">条目</th><th scope="col">数量</th><th scope="col">单价</th><th scope="col">小计</th><th scope="col">来源</th></tr></thead><tbody><tr v-for="line in lines" :key="line.id"><th scope="row">{{ line.label }}<small v-if="line.pendingReason">{{ line.pendingReason }}</small></th><td>{{ line.quantity }} {{ line.unit }}</td><td :class="{ pending: line.unitCents === null }">{{ money(line.unitCents, line.currency) }}</td><td :class="{ pending: lineAmountCents(line) === null }">{{ money(lineAmountCents(line), line.currency) }}</td><td><button class="source-link compact" :aria-label="`查看${line.label}来源`" @click="openSource($event, line)">查看</button></td></tr></tbody></table></div>
            <div class="totals"><div v-for="total in totals" :key="total.currency" class="total-row"><div><strong>{{ total.currency }} {{ total.completeCents === null ? '已知部分' : '总额' }}</strong><small v-if="total.unknownLines">{{ total.unknownLines }} 项待确认 · 完整总额未知</small><small v-else>当前样本条目均有确定价格</small></div><strong>{{ total.knownLines ? money(total.knownCents, total.currency) : '未知' }}</strong></div></div>
            <p v-if="totals.length > 1" class="caution-note">USD 与 EUR 分开显示；不做未经授权的换汇或跨币种总额。</p>
            <p v-if="isComplete" class="verification-note">样例核算依据：3 × 1,800.00 + 2 × 120.50 + 50 × 2.40 = USD 5,761.00。{{ task.taxBasis }}</p>
          </section>

          <section class="surface questions-card" aria-labelledby="questions-title"><div class="section-top"><div><p class="overline">需要你的判断</p><h2 id="questions-title">待确认字段 <span class="count">{{ visibleQuestions.length }}</span></h2></div><button class="secondary-button" @click="resetDemo">重置演示</button></div><template v-if="visibleQuestions.length"><ol><li v-for="question in visibleQuestions" :key="question">{{ question }}</li></ol><button v-if="activeId === 'missing'" class="primary-button" @click="openEdit">补充运输单价 <span aria-hidden="true">↗</span></button></template><p v-else class="all-clear">这个固定样本没有待确认字段。真实任务仍需独立验证。</p></section>
        </template>
        <p class="main-footer">页面不接收任意输入生成结果，也不调用模型、账号或产品服务。当前所有状态由本地演示控件切换。</p>
        </template>
      </main>

      <aside v-if="view === 'demo'" class="aux-column" aria-label="伙伴与样本说明"><button class="aux-toggle" :aria-expanded="auxiliaryOpen" aria-controls="aux-content" @click="auxiliaryOpen = !auxiliaryOpen">伙伴与样本说明 <span aria-hidden="true">{{ auxiliaryOpen ? '−' : '+' }}</span></button><div id="aux-content" class="aux-content" :class="{ open: auxiliaryOpen }"><section class="buddy-card"><svg viewBox="0 0 200 200" role="img" aria-label="原创花朵形伙伴图形" class="buddy-svg"><g fill="#d98b70"><ellipse cx="100" cy="57" rx="29" ry="43"/><ellipse cx="100" cy="143" rx="29" ry="43"/><ellipse cx="57" cy="100" rx="43" ry="29"/><ellipse cx="143" cy="100" rx="43" ry="29"/><ellipse cx="70" cy="70" rx="31" ry="40" transform="rotate(-45 70 70)"/><ellipse cx="130" cy="70" rx="31" ry="40" transform="rotate(45 130 70)"/><ellipse cx="70" cy="130" rx="31" ry="40" transform="rotate(45 70 130)"/><circle cx="100" cy="100" r="53"/></g><g fill="none" stroke="#593d30" stroke-width="4.5" stroke-linecap="round"><path d="M83 92v9m34-9v9"/><path d="M93 116q7 6 14 0" stroke-width="3"/></g><ellipse cx="68" cy="110" rx="8" ry="4" fill="#bd6d58" opacity=".45"/><ellipse cx="132" cy="110" rx="8" ry="4" fill="#bd6d58" opacity=".45"/></svg><p>慢一点，也没关系。</p><span>先把确定的说清楚。</span></section><section class="aux-note"><p class="overline">关于这份小样</p><h2>信息从哪里来？</h2><p>左侧是两个固定虚构询价。单价来自样本价格表；修订仅在当前页面生效。行小计由整数分确定性计算。</p><div class="source-legend"><span>输入</span><span>用户确认</span><span>确定性计算</span><span>待确认</span></div><p class="aux-warning">没有连接真实执行器。任务退出、完成与验证状态都只是独立演示样例。</p></section></div></aside>
    </div>

    <div v-if="view === 'demo' && modal" class="modal-backdrop" @mousedown.self="closeModal"><section ref="dialogRoot" class="dialog" role="dialog" aria-modal="true" :aria-label="modal === 'source' ? sourceTitle : '补充运输单价'" @keydown="onDialogKeydown"><div class="dialog-head"><p class="overline">{{ modal === 'source' ? '来源核对' : '本地演示修订' }}</p><button class="icon-close" aria-label="关闭弹层" @click="closeModal">×</button></div><template v-if="modal === 'source'"><h2>{{ sourceTitle }}</h2><p>{{ sourceText }}</p><button class="secondary-button" @click="closeModal">知道了</button></template><template v-else><h2>补充运输单价</h2><p>原值为空，币种为 EUR。这里的保存只修改本页面样例，不会提交真实任务。</p><label for="transport-price">单价（EUR）</label><input id="transport-price" ref="editInput" v-model="priceInput" inputmode="decimal" autocomplete="off" placeholder="例如 320.00" @keydown.enter="saveEdit"><p v-if="priceError" class="form-error" role="alert">{{ priceError }}</p><div class="dialog-actions"><button class="secondary-button" @click="closeModal">取消修改</button><button class="primary-button" @click="saveEdit">保存本地修订</button></div></template></section></div>
  </div>
</template>
