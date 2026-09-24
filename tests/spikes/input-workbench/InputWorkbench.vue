<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onUnmounted, ref, shallowRef } from 'vue'
import { createDraft, currentIssues, currentRows, saveModification, undoLast, clearModifications } from './draft'
import { exportDraftBytes, importDraftBytes } from './draft-io'
import { DraftInputError, LIMITS, readSelectedText, type InputDraft } from './model'
import SourceDialog from './SourceDialog.vue'
import ReviewPanel from './candidate-review/ReviewPanel.vue'
import './workbench.css'

const requirementInput = ref('')
const csvInput = ref('')
const csvFileName = ref('粘贴内容.csv')
const draft = shallowRef<InputDraft | null>(null)
const reviewRevision = ref(0)
const error = ref('')
const notice = ref('')
const readingCsv = ref(false)
const readingDraft = ref(false)
const exporting = ref(false)
const page = ref(0)
const pageSize = 50
// Every input choice shares one generation. A later choice invalidates every pending read.
let inputIntent = 0
let active = true
let invokingElement: HTMLElement | null = null
function beginInputIntent(): number {
  inputIntent++
  reviewRevision.value++
  if (pendingReplacement.value) invokingElement = null
  pendingReplacement.value = null
  readingCsv.value = false
  readingDraft.value = false
  exporting.value = false
  error.value = ''
  notice.value = ''
  return inputIntent
}
const isCurrent = (intent: number): boolean => active && intent === inputIntent
function deactivate() {
  active = false
  beginInputIntent()
  sourceCell.value = null
  editCell.value = null
  invokingElement = null
}
onActivated(() => { active = true })
onDeactivated(deactivate)
onUnmounted(deactivate)

const rows = computed(() => draft.value ? currentRows(draft.value) : [])
const issues = computed(() => draft.value ? currentIssues(draft.value) : [])
const reviewInputReady = computed(() => !!draft.value
  && requirementInput.value === draft.value.requirementText
  && csvInput.value === draft.value.csvText
  && csvFileName.value === draft.value.fileName)
const visibleRows = computed(() => rows.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const maxPage = computed(() => Math.max(0, Math.ceil(rows.value.length / pageSize) - 1))
const sourceCell = ref<{ recordIndex: number; columnIndex: number } | null>(null)
const editCell = ref<{ recordIndex: number; columnIndex: number } | null>(null)
const editValue = ref('')
const editError = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)
const editOriginalValue = ref('')
const editInitialDomValue = ref('')
const editTouched = ref(false)
const editDialog = ref<HTMLElement | null>(null)
const pendingReplacement = shallowRef<{ draft: InputDraft; intent: number } | null>(null)
const replaceDialog = ref<HTMLElement | null>(null)
const replaceCancel = ref<HTMLButtonElement | null>(null)
const sourceHeader = computed(() => sourceCell.value && draft.value
  ? draft.value.original.headers[sourceCell.value.columnIndex] ?? '' : '')
const sourceOriginal = computed(() => sourceCell.value && draft.value
  ? draft.value.original.rows[sourceCell.value.recordIndex - 1]?.[sourceCell.value.columnIndex] ?? '' : '')
const sourceCurrent = computed(() => sourceCell.value
  ? rows.value[sourceCell.value.recordIndex - 1]?.[sourceCell.value.columnIndex] ?? '' : '')

function message(errorValue: unknown): string {
  return errorValue instanceof DraftInputError ? errorValue.message : '读取失败，当前草稿未改变。'
}
function onRequirementTyping() { beginInputIntent() }
function onCsvTyping() { beginInputIntent(); csvFileName.value = '粘贴内容.csv' }
async function onCsvFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  const intent = beginInputIntent()
  readingCsv.value = true
  try {
    const text = await readSelectedText(file, LIMITS.csvBytes)
    if (!isCurrent(intent)) return
    csvInput.value = text
    csvFileName.value = file.name
    notice.value = `已读取 ${file.name}；点击“核对输入”后才更新草稿。`
  } catch (cause) { if (isCurrent(intent)) error.value = message(cause) }
  finally { if (isCurrent(intent)) readingCsv.value = false }
}
function install(next: InputDraft, intent: number) {
  if (!isCurrent(intent)) return
  beginInputIntent()
  draft.value = next
  requirementInput.value = next.requirementText
  csvInput.value = next.csvText
  csvFileName.value = next.fileName
  page.value = 0
  sourceCell.value = null
  editCell.value = null
  notice.value = '本地核对草稿已更新；尚未经过 AI 整理。'
}
async function propose(next: InputDraft, intent: number, trigger: HTMLElement | null) {
  if (!isCurrent(intent)) return
  if (draft.value?.modifications.length) {
    invokingElement = trigger
    const candidate = { draft: next, intent }
    pendingReplacement.value = candidate
    await nextTick()
    if (isCurrent(intent) && pendingReplacement.value === candidate) replaceCancel.value?.focus()
  } else install(next, intent)
}
function checkInput(event: Event) {
  const trigger = event.currentTarget as HTMLElement
  const intent = beginInputIntent()
  try { void propose(createDraft(requirementInput.value, csvInput.value, csvFileName.value), intent, trigger) }
  catch (cause) { error.value = message(cause) }
}
function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  if (!target?.isConnected) return false
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    const style = window.getComputedStyle(node)
    if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
async function restoreFocus(target: HTMLElement | null) {
  await nextTick()
  if (canRestoreFocus(target)) target.focus()
}
async function cancelReplacement() {
  pendingReplacement.value = null
  const trigger = invokingElement
  invokingElement = null
  await restoreFocus(trigger)
}
async function confirmReplacement() {
  const candidate = pendingReplacement.value
  const trigger = invokingElement
  if (!candidate || !isCurrent(candidate.intent)) {
    pendingReplacement.value = null
    invokingElement = null
    return
  }
  install(candidate.draft, candidate.intent)
  invokingElement = null
  await restoreFocus(trigger)
}
function replaceKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); void cancelReplacement() }
  if (event.key === 'Tab') trapFocus(event, replaceDialog.value)
}
async function onDraftFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  const intent = beginInputIntent()
  readingDraft.value = true
  try {
    if (file.size > LIMITS.draftBytes) throw new DraftInputError('size', '草稿 JSON 超过 8 MiB。')
    const bytes = await file.arrayBuffer()
    if (!isCurrent(intent)) return
    const next = await importDraftBytes(bytes)
    if (!isCurrent(intent)) return
    await propose(next, intent, input)
  } catch (cause) { if (isCurrent(intent)) error.value = message(cause) }
  finally { if (isCurrent(intent)) readingDraft.value = false }
}
async function downloadDraft() {
  if (!draft.value) return
  const intent = inputIntent
  exporting.value = true
  error.value = ''
  try {
    const bytes = await exportDraftBytes(draft.value)
    if (!isCurrent(intent)) return
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'input-draft.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    notice.value = '已生成草稿 JSON 下载；是否保存到磁盘请在浏览器中确认。'
  } catch (cause) { if (isCurrent(intent)) error.value = message(cause) }
  finally { if (isCurrent(intent)) exporting.value = false }
}
function openSource(event: Event, recordIndex: number, columnIndex: number) {
  invokingElement = event.currentTarget as HTMLElement
  sourceCell.value = { recordIndex, columnIndex }
}
async function closeSource() {
  sourceCell.value = null
  const trigger = invokingElement
  invokingElement = null
  await restoreFocus(trigger)
}
async function openEdit(event: Event, recordIndex: number, columnIndex: number) {
  invokingElement = event.currentTarget as HTMLElement
  editCell.value = { recordIndex, columnIndex }
  editOriginalValue.value = rows.value[recordIndex - 1]?.[columnIndex] ?? ''
  editValue.value = editOriginalValue.value
  editTouched.value = false
  editError.value = ''
  await nextTick()
  // textarea normalizes CRLF/CR for its DOM value; retain the exact source when unchanged.
  editInitialDomValue.value = editInput.value?.value ?? editOriginalValue.value
  editInput.value?.focus()
}
async function closeEdit() {
  editCell.value = null
  const trigger = invokingElement
  invokingElement = null
  await restoreFocus(trigger)
}
function saveEdit() {
  if (!draft.value || !editCell.value) return
  try {
    const value = !editTouched.value || editValue.value === editInitialDomValue.value
      ? editOriginalValue.value : editValue.value
    draft.value = saveModification(draft.value, editCell.value.recordIndex,
      editCell.value.columnIndex, value)
    reviewRevision.value++
    notice.value = '本地修改已保存，原始内容仍可查看。'
    void closeEdit()
  } catch (cause) { editError.value = message(cause) }
}
function editKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); void closeEdit() }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    saveEdit()
  }
  if (event.key === 'Tab') trapFocus(event, editDialog.value)
}
function trapFocus(event: KeyboardEvent, root: HTMLElement | null) {
  const controls = [...(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? [])]
  if (!controls.length) return
  if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
  else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
}
function undo() { if (draft.value) { draft.value = undoLast(draft.value); reviewRevision.value++ } }
function clear() { if (draft.value) { draft.value = clearModifications(draft.value); reviewRevision.value++ } }
</script>

<template>
  <div class="iw-root">
    <div class="iw-intro"><p class="overline">准备我的输入</p><h1>先把资料放在一起核对</h1><p>本地输入核对，尚未经过 AI 整理。只检查 CSV 结构、空值和格式，不生成报价或任务结果。</p></div>
    <section class="surface iw-input" aria-labelledby="iw-input-title">
      <div class="section-top"><div><p class="overline">原始内容</p><h2 id="iw-input-title">需求文字与 CSV</h2></div><span class="fiction-label">仅本机页面</span></div>
      <label for="iw-requirement">需求原文 <small>最多 64 KiB</small></label>
      <textarea id="iw-requirement" v-model="requirementInput" rows="5" placeholder="粘贴收到的需求原文；这里不会自动理解或改写" @input="onRequirementTyping"></textarea>
      <label for="iw-csv">CSV 原文 <small>最多 2 MiB</small></label>
      <textarea id="iw-csv" v-model="csvInput" rows="6" placeholder="粘贴含表头的 CSV，或在下面选择文件" @input="onCsvTyping"></textarea>
      <div class="iw-file-row"><label for="iw-csv-file">选择 CSV 文件</label><input id="iw-csv-file" type="file" accept=".csv,text/csv" @change="onCsvFile"><span>{{ readingCsv ? '正在读取…' : csvFileName }}</span></div>
      <div class="iw-actions"><button type="button" class="primary-button" :disabled="readingCsv || readingDraft" @click="checkInput">核对输入</button><span>需要需求文字和 CSV 两项；不会启动任务。</span></div>
    </section>
    <p v-if="error" class="iw-error" role="alert">{{ error }}</p><p v-if="notice" class="iw-notice" role="status">{{ notice }}</p>

    <section v-if="draft" class="surface iw-review" aria-labelledby="iw-review-title">
      <div class="section-top"><div><p class="overline">本地草稿</p><h2 id="iw-review-title">逐项核对原表</h2></div><span class="iw-summary">{{ draft.original.sourceSummary.fileName }} · {{ draft.original.sourceSummary.records }} 条数据 · {{ draft.original.sourceSummary.columns }} 列</span></div>
      <p class="iw-help">第 1 条数据从表头后开始计数。名称、网址和公式只作为文字显示；没有读取需求文字中的隐含价格。</p>
      <div class="iw-issues" aria-live="polite"><h3>待补充与格式问题 <span>{{ issues.length }}</span></h3><p v-if="!issues.length">未发现可确定的列、空值或格式问题；语义仍需人工核对。</p><ul v-else><li v-for="(issue, index) in issues.slice(0, 50)" :key="index">{{ issue.message }}</li></ul><p v-if="issues.length > 50">另有 {{ issues.length - 50 }} 项；请逐页查看原表。</p></div>
      <div class="iw-table-wrap"><table><thead><tr><th scope="col">记录</th><th v-for="(header, index) in draft.original.headers" :key="index" scope="col">{{ header }}</th></tr></thead><tbody><tr v-for="(row, rowOffset) in visibleRows" :key="page * pageSize + rowOffset"><th scope="row">{{ page * pageSize + rowOffset + 1 }}</th><td v-for="(cell, colIndex) in row" :key="colIndex"><div class="iw-cell-value" :class="{ 'iw-empty': cell === '' }">{{ cell === '' ? '待补充' : cell }}</div><div class="iw-cell-actions"><button type="button" :aria-label="`查看第${page * pageSize + rowOffset + 1}条${draft.original.headers[colIndex]}来源`" @click="openSource($event, page * pageSize + rowOffset + 1, colIndex)">来源</button><button type="button" :aria-label="`修改第${page * pageSize + rowOffset + 1}条${draft.original.headers[colIndex]}`" @click="openEdit($event, page * pageSize + rowOffset + 1, colIndex)">修改</button></div></td></tr></tbody></table></div>
      <div class="iw-pages"><button type="button" class="secondary-button" :disabled="page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ maxPage + 1 }} 页</span><button type="button" class="secondary-button" :disabled="page >= maxPage" @click="page++">下一页</button></div>
      <div class="iw-history"><h3>本地修改 <span>{{ draft.modifications.length }} / {{ LIMITS.modifications }}</span></h3><ol v-if="draft.modifications.length"><li v-for="(edit, index) in draft.modifications" :key="index">第 {{ edit.recordIndex }} 条 · {{ edit.header }}：{{ edit.oldValue === '' ? '空值' : edit.oldValue }} → {{ edit.newValue === '' ? '空值' : edit.newValue }} · {{ edit.source }}</li></ol><p v-else>还没有本地修改；原表保持不变。</p><div class="iw-actions"><button type="button" class="secondary-button" :disabled="!draft.modifications.length" @click="undo">撤销最近一次</button><button type="button" class="secondary-button" :disabled="!draft.modifications.length" @click="clear">清空本次修改</button></div></div>
      <div class="iw-export"><button type="button" class="primary-button" :disabled="exporting" @click="downloadDraft">{{ exporting ? '正在生成…' : '导出草稿 JSON' }}</button><label for="iw-draft-file">重新打开草稿</label><input id="iw-draft-file" type="file" accept=".json,application/json" :disabled="readingDraft" @change="onDraftFile"><small>草稿只含原始输入、哈希和本地修改；不是技能或完成成果。</small></div>
    </section>
    <section v-else class="surface iw-empty-state"><h2>还没有核对草稿</h2><p>先填齐需求文字和 CSV，再点击“核对输入”。</p><label for="iw-draft-file-empty">也可以重新打开草稿 JSON</label><input id="iw-draft-file-empty" type="file" accept=".json,application/json" :disabled="readingDraft" @change="onDraftFile"></section>

    <ReviewPanel v-if="draft" :draft="draft" :revision="reviewRevision" :input-ready="reviewInputReady" />

    <SourceDialog v-if="draft && sourceCell" :title="`第 ${sourceCell.recordIndex} 条 · ${sourceHeader}`" :file-name="draft.fileName" :record-index="sourceCell.recordIndex" :header="sourceHeader" :original-value="sourceOriginal" :current-value="sourceCurrent" :requirement-text="draft.requirementText" :csv-text="draft.csvText" @close="closeSource" />
    <div v-if="editCell && draft" class="iw-modal-backdrop" @mousedown.self="closeEdit"><section ref="editDialog" class="iw-dialog" role="dialog" aria-modal="true" aria-label="修改单元格" @keydown="editKeydown"><div class="iw-dialog-head"><p class="overline">本地修改</p><button type="button" class="iw-close" aria-label="关闭修改" @click="closeEdit">×</button></div><h2>第 {{ editCell.recordIndex }} 条 · {{ draft.original.headers[editCell.columnIndex] }}</h2><p>原值：{{ draft.original.rows[editCell.recordIndex - 1]?.[editCell.columnIndex] === '' ? '空值' : draft.original.rows[editCell.recordIndex - 1]?.[editCell.columnIndex] }}。保存只更新当前草稿，不改原始 CSV。</p><label for="iw-edit-value">当前内容</label><textarea id="iw-edit-value" ref="editInput" v-model="editValue" rows="6" @input="editTouched = true"></textarea><p class="iw-help">Enter 换行；点击保存或按 Ctrl+Enter / ⌘+Enter 保存。编辑后换行统一为 LF；未改动直接保存保留原值。</p><p v-if="editError" class="iw-error" role="alert">{{ editError }}</p><div class="iw-actions"><button type="button" class="secondary-button" @click="closeEdit">取消修改</button><button type="button" class="primary-button" @click="saveEdit">保存本地修改</button></div></section></div>
    <div v-if="pendingReplacement" class="iw-modal-backdrop"><section ref="replaceDialog" class="iw-dialog" role="dialog" aria-modal="true" aria-label="更换原始输入" @keydown="replaceKeydown"><h2>更换这份草稿？</h2><p>当前 {{ draft?.modifications.length ?? 0 }} 次本地修改将从页面移除。可以先导出草稿；取消会保留当前内容。</p><div class="iw-actions"><button ref="replaceCancel" type="button" class="secondary-button" @click="cancelReplacement">保留当前草稿</button><button type="button" class="primary-button" @click="confirmReplacement">丢弃修改并更换</button></div></section></div>
  </div>
</template>
