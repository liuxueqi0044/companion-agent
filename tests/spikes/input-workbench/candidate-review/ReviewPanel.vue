<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onUnmounted, ref, shallowRef, watch } from 'vue'
import { DraftInputError, LIMITS, REQUIRED_COLUMNS, type InputDraft, type RequiredColumn } from '../model'
import { cellSource, CandidateError, validateCandidateBytes } from './candidate'
import { reviewRecordBytes } from './review-record'
import { exportSnapshotBytes, prepareSnapshot } from './snapshot'
import { type ClaimField, type ConfirmationState, type InputSnapshot,
  type TextClaim, type ValidatedCandidate } from './types'
import './review.css'

const props = defineProps<{ draft: InputDraft; revision: number; inputReady: boolean }>()
const snapshot = shallowRef<InputSnapshot | null>(null)
const validated = shallowRef<ValidatedCandidate | null>(null)
const preparing = ref(false)
const readingCandidate = ref(false)
const exportingReview = ref(false)
const error = ref('')
const notice = ref('')
const candidateError = ref('')
const candidateNotice = ref('')
const candidateFileName = ref('')
const checked = ref<ConfirmationState>(blankChecks())
const page = ref(0)
const pageSize = 50
const source = ref<{ kind: 'claim'; field: ClaimField } |
  { kind: 'cell'; recordIndex: number; column: RequiredColumn } | null>(null)
const sourceClose = ref<HTMLButtonElement | null>(null)
let sourceTrigger: HTMLElement | null = null
let sourceOpenSeq = 0
let checkedRevision = 0
let generation = 0
let active = true

function blankChecks(): ConfirmationState {
  return { summary: false, deliverable: false, time: false, place: false, special: false }
}
function invalidate() {
  generation++
  snapshot.value = null
  validated.value = null
  checked.value = blankChecks()
  checkedRevision++
  preparing.value = false
  readingCandidate.value = false
  exportingReview.value = false
  candidateFileName.value = ''
  source.value = null
  sourceOpenSeq++
  sourceTrigger = null
  error.value = ''
  notice.value = ''
  candidateError.value = ''
  candidateNotice.value = ''
}
watch(() => [props.draft, props.revision, props.inputReady], invalidate, { flush: 'sync' })
onActivated(() => { active = true })
onDeactivated(() => { active = false; invalidate() })
onUnmounted(() => { active = false; invalidate() })
const current = (run: number, draft: InputDraft, revision: number) =>
  active && generation === run && props.draft === draft && props.revision === revision && props.inputReady
const currentSnapshot = (run: number, selected: InputSnapshot, draft: InputDraft, revision: number) =>
  current(run, draft, revision) && snapshot.value === selected
function message(cause: unknown): string {
  if (cause instanceof CandidateError || cause instanceof DraftInputError) return cause.message
  return '读取或校验失败；当前已载入候选未改变。'
}
function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function prepare() {
  if (!props.inputReady) return
  invalidate()
  const run = generation
  const draft = props.draft
  const revision = props.revision
  preparing.value = true
  try {
    const next = await prepareSnapshot(draft)
    if (!current(run, draft, revision)) return
    snapshot.value = next
    notice.value = '输入快照已固定；它只绑定本地内容，不代表 AI 已整理。'
  } catch (cause) { if (current(run, draft, revision)) error.value = message(cause) }
  finally { if (current(run, draft, revision)) preparing.value = false }
}
function downloadSnapshot() {
  if (!snapshot.value) return
  try {
    download(exportSnapshotBytes(snapshot.value), 'review-input-snapshot.json')
    notice.value = '已生成输入快照下载；是否保存到磁盘请在浏览器中确认。'
  } catch (cause) { error.value = message(cause) }
}
async function selectCandidate(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !snapshot.value) return
  input.value = ''
  const selected = snapshot.value
  const draft = props.draft
  const revision = props.revision
  const run = ++generation
  readingCandidate.value = true
  exportingReview.value = false
  candidateError.value = ''
  candidateNotice.value = ''
  try {
    if (file.size > LIMITS.draftBytes) throw new CandidateError('$', '候选 JSON 超过 8 MiB')
    const bytes = await file.arrayBuffer()
    if (!currentSnapshot(run, selected, draft, revision)) return
    const next = await validateCandidateBytes(bytes, selected)
    if (!currentSnapshot(run, selected, draft, revision)) return
    validated.value = next
    candidateFileName.value = file.name
    checked.value = blankChecks()
    checkedRevision++
    page.value = 0
    source.value = null
    sourceTrigger = null
    candidateNotice.value = '候选已通过结构与来源位置校验；内容仍需人工核对。'
  } catch (cause) { if (currentSnapshot(run, selected, draft, revision)) candidateError.value = message(cause) }
  finally { if (currentSnapshot(run, selected, draft, revision)) readingCandidate.value = false }
}
const claimItems = computed(() => {
  if (!validated.value) return []
  const candidate = validated.value.candidate
  return [
    { field: 'summary' as const, label: '需求摘要', claim: candidate.summary },
    { field: 'deliverable' as const, label: '交付物', claim: candidate.elements.deliverable },
    { field: 'time' as const, label: '时间', claim: candidate.elements.time },
    { field: 'place' as const, label: '地点', claim: candidate.elements.place },
    { field: 'special' as const, label: '特殊要求', claim: candidate.elements.special },
  ]
})
const nullClaims = computed(() => claimItems.value.filter(item => item.claim.text === null))
const visibleRows = computed(() => validated.value?.candidate.rows.slice(page.value * pageSize,
  (page.value + 1) * pageSize) ?? [])
const maxPage = computed(() => Math.max(0,
  Math.ceil((validated.value?.candidate.rows.length ?? 0) / pageSize) - 1))
const sourceClaim = computed<TextClaim | null>(() => {
  const selected = source.value
  return selected?.kind === 'claim'
    ? claimItems.value.find(item => item.field === selected.field)?.claim ?? null : null
})
const sourceCell = computed(() => source.value?.kind === 'cell' && snapshot.value
  ? cellSource(snapshot.value, source.value.recordIndex, source.value.column) : null)
function questionTarget(target: { kind: 'requirement'; field: ClaimField } |
  { kind: 'csv'; recordIndex: number | null; column: RequiredColumn }): string {
  if (target.kind === 'requirement') return `需求字段：${target.field}`
  return target.recordIndex === null ? `CSV 缺少 ${target.column} 整列`
    : `CSV 第 ${target.recordIndex} 条数据 · ${target.column}`
}
function toggle(field: ClaimField) {
  const entry = claimItems.value.find(item => item.field === field)
  if (!entry || entry.claim.text === null) return
  checked.value = { ...checked.value, [field]: !checked.value[field] }
  checkedRevision++
}
function openSource(event: Event, detail: NonNullable<typeof source.value>) {
  sourceTrigger = event.currentTarget as HTMLElement
  const seq = ++sourceOpenSeq
  source.value = detail
  void nextTick(() => { if (sourceOpenSeq === seq && active) sourceClose.value?.focus() })
}
function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  if (!target?.isConnected) return false
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    const style = window.getComputedStyle(node)
    if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
async function closeSource() {
  sourceOpenSeq++
  source.value = null
  const trigger = sourceTrigger
  sourceTrigger = null
  await nextTick()
  if (canRestoreFocus(trigger)) trigger.focus()
}
function sourceKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); void closeSource() }
  if (event.key === 'Tab') { event.preventDefault(); sourceClose.value?.focus() }
}
async function exportReview() {
  const selected = snapshot.value
  const candidate = validated.value
  if (!selected || !candidate) return
  const draft = props.draft
  const revision = props.revision
  const run = generation
  const mark = checkedRevision
  const confirmations = { ...checked.value }
  exportingReview.value = true
  candidateError.value = ''
  try {
    await Promise.resolve()
    const bytes = reviewRecordBytes(selected, candidate, confirmations)
    if (!currentSnapshot(run, selected, draft, revision) || validated.value !== candidate
        || checkedRevision !== mark) return
    download(bytes, 'candidate-review-record.json')
    candidateNotice.value = '已生成核对记录下载；这不是已完成成果或技能。'
  } catch (cause) {
    if (currentSnapshot(run, selected, draft, revision) && validated.value === candidate)
      candidateError.value = message(cause)
  } finally {
    if (currentSnapshot(run, selected, draft, revision) && validated.value === candidate)
      exportingReview.value = false
  }
}
</script>

<template>
  <section class="surface cr-root" aria-labelledby="cr-title">
    <div class="section-top"><div><p class="overline">下一步 · 本地来源核对</p><h2 id="cr-title">固定输入，核对候选</h2></div><span class="fiction-label">不调用模型</span></div>
    <p class="cr-help">先固定当前已核对的原文、CSV 与本地修改，再手动选择对应候选 JSON。候选来自文件，不代表 AI 已整理；校验通过也仍需人工判断语义。</p>
    <p v-if="!inputReady" class="cr-warning">上方输入已有待核对变化；请先点击“核对输入”，再准备快照。</p>
    <div class="iw-actions"><button type="button" class="primary-button" :disabled="!inputReady || preparing" @click="prepare">{{ preparing ? '正在准备…' : '准备核对快照' }}</button><button v-if="snapshot" type="button" class="secondary-button" @click="downloadSnapshot">下载输入快照 JSON</button></div>
    <p v-if="error" class="iw-error" role="alert">{{ error }}</p><p v-if="notice" class="iw-notice" role="status">{{ notice }}</p>
    <p v-if="snapshot" class="cr-hash">输入内容哈希：<code>{{ snapshot.inputHash }}</code>。这是内容绑定，不是签名或用户授权。</p>

    <div v-if="snapshot" class="cr-import">
      <label for="cr-candidate-file">选择候选 JSON <small>最多 8 MiB；只从本机读取</small></label>
      <input id="cr-candidate-file" type="file" accept=".json,application/json" @change="selectCandidate">
      <span v-if="readingCandidate" role="status">正在校验候选…</span>
      <details class="cr-example"><summary>查看格式提示</summary><p>文件需包含版本、上方输入哈希、摘要与四项需求要素、每条 CSV 数据记录以及待确认问题。示例仅说明字段形状，不会自动载入或生成成果。</p><pre>{"version":"local-structured-candidate/1","inputHash":"sha256:…","summary":{"text":null,"evidence":[]},"elements":{"deliverable":{"text":null,"evidence":[]},"time":{"text":null,"evidence":[]},"place":{"text":null,"evidence":[]},"special":{"text":null,"evidence":[]}},"rows":[],"questions":[]}</pre></details>
      <p v-if="candidateError" class="iw-error" role="alert">{{ candidateError }}</p>
      <p v-if="candidateNotice" class="iw-notice" role="status">{{ candidateNotice }}</p>
    </div>

    <div v-if="snapshot && validated" class="cr-result">
      <h3>候选内容，需人工核对</h3><p class="cr-help">来自 {{ candidateFileName }}。原文引用只验证位置，不证明解释正确；没有自动计算金额、完成任务或保存技能。</p>
      <div class="cr-claims"><div v-for="entry in claimItems" :key="entry.field" class="cr-claim"><h4>{{ entry.label }}</h4><p class="cr-value">{{ entry.claim.text ?? '未提取，待确认' }}</p><div class="iw-actions"><button v-if="entry.claim.text !== null" type="button" class="secondary-button" :aria-label="`查看${entry.label}原文引用`" @click="openSource($event, { kind: 'claim', field: entry.field })">查看原文引用</button><button v-if="entry.claim.text !== null" type="button" class="secondary-button" :aria-pressed="checked[entry.field]" :aria-label="`${checked[entry.field] ? '取消' : '标记'}${entry.label}人工核对`" @click="toggle(entry.field)">{{ checked[entry.field] ? '取消人工核对' : '标为已人工核对' }}</button></div></div></div>
      <h4>CSV 明细 · 仅逐值对齐</h4><p class="cr-help">数据记录序号从表头后计数，不是文本物理行号；同名条目不合并。空值、明确的 0 和缺整列保持区分。</p>
      <div class="cr-table-wrap"><table><thead><tr><th scope="col">数据记录</th><th v-for="column in REQUIRED_COLUMNS" :key="column" scope="col">{{ column }}</th></tr></thead><tbody><tr v-for="row in visibleRows" :key="row.recordIndex" :data-record-index="row.recordIndex"><th scope="row">{{ row.recordIndex }}</th><td v-for="column in REQUIRED_COLUMNS" :key="column"><span class="cr-cell-value" :class="{ 'cr-missing': row[column] === null || row[column] === '' }">{{ row[column] === null ? '缺列，待补充' : row[column] === '' ? '空值，待补充' : row[column] }}</span><button type="button" :aria-label="`查看第${row.recordIndex}条${column}候选来源`" @click="openSource($event, { kind: 'cell', recordIndex: row.recordIndex, column })">来源</button></td></tr></tbody></table></div>
      <div class="iw-pages"><button type="button" class="secondary-button" :disabled="page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ maxPage + 1 }} 页</span><button type="button" class="secondary-button" :disabled="page >= maxPage" @click="page++">下一页</button></div>
      <div class="cr-questions"><h4>本地检查问题 · {{ snapshot.issues.length }}</h4><p v-if="!snapshot.issues.length">未发现确定的 CSV 结构/格式问题；仍需人工核对语义。</p><ul v-else><li v-for="(issue, index) in snapshot.issues.slice(0, 100)" :key="index">{{ issue.message }}</li></ul><p v-if="snapshot.issues.length > 100">另有 {{ snapshot.issues.length - 100 }} 项，核对记录仍保留全部本地检查。</p><h4>未提取的需求字段 · {{ nullClaims.length }}</h4><ul v-if="nullClaims.length"><li v-for="entry in nullClaims" :key="entry.field">{{ entry.label }}：待确认（不保证原文未提及）</li></ul><p v-else>五项需求字段均有候选值，仍需人工核对。</p><h4>候选提出的问题 · {{ validated.candidate.questions.length }}</h4><ul v-if="validated.candidate.questions.length"><li v-for="(question, index) in validated.candidate.questions" :key="index">{{ question.text }} · {{ questionTarget(question.target) }}</li></ul><p v-else>候选未提出额外问题；本地检查和未提取字段仍显示在上方。</p></div>
      <div class="iw-actions"><button type="button" class="primary-button" :disabled="exportingReview" @click="exportReview">{{ exportingReview ? '正在生成…' : '导出核对记录 JSON' }}</button><span>仅记录本地人工核对；不是已完成成果或技能。</span></div>
    </div>

    <div v-if="source && snapshot" class="iw-modal-backdrop" @mousedown.self="closeSource"><section class="iw-dialog cr-source-dialog" role="dialog" aria-modal="true" aria-label="候选来源" @keydown="sourceKeydown"><div class="iw-dialog-head"><p class="overline">来源与原值</p><button ref="sourceClose" type="button" class="iw-close" aria-label="关闭候选来源" @click="closeSource">×</button></div><template v-if="source.kind === 'claim' && sourceClaim"><h2>需求原文引用</h2><p>引用位置由候选给出，下面的文字从当前输入快照切取；引用不证明候选描述正确。</p><ol><li v-for="(range, index) in sourceClaim.evidence" :key="index"><span>UTF-16 {{ range.start }}–{{ range.end }}</span><pre>{{ snapshot.draft.requirementText.slice(range.start, range.end) }}</pre></li></ol></template><template v-else-if="sourceCell"><h2>{{ sourceCell.fileName }} · 第 {{ sourceCell.recordIndex }} 条数据 · {{ sourceCell.column }}</h2><p>来源类别：{{ sourceCell.label }}；数据记录序号不是文本物理行号。</p><div v-if="sourceCell.originalValue !== null" class="cr-source-values"><div><strong>原始输入</strong><pre>{{ sourceCell.originalValue === '' ? '（空值）' : sourceCell.originalValue }}</pre></div><div><strong>当前值</strong><pre>{{ sourceCell.currentValue === '' ? '（空值）' : sourceCell.currentValue }}</pre></div></div><p v-else>原表缺少整列，没有可引用的单元格。</p><ol v-if="sourceCell.modifications.length"><li v-for="(edit, index) in sourceCell.modifications" :key="index">本地用户修改 {{ index + 1 }}：<pre>{{ edit.oldValue }} → {{ edit.newValue }}</pre></li></ol></template></section></div>
  </section>
</template>
