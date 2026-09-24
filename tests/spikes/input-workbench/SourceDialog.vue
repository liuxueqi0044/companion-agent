<script setup lang="ts">
import { onMounted, ref } from 'vue'

defineProps<{ title: string; fileName: string; recordIndex: number; header: string;
  originalValue: string; currentValue: string; requirementText: string; csvText: string }>()
const emit = defineEmits<{ close: [] }>()
const closeButton = ref<HTMLButtonElement | null>(null)
onMounted(() => closeButton.value?.focus())
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  if (event.key === 'Tab') { event.preventDefault(); closeButton.value?.focus() }
}
</script>

<template>
  <div class="iw-modal-backdrop" @mousedown.self="emit('close')">
    <section class="iw-dialog" role="dialog" aria-modal="true" :aria-label="title" @keydown="onKeydown">
      <div class="iw-dialog-head"><p class="overline">原始来源</p><button ref="closeButton" type="button" class="iw-close" aria-label="关闭来源" @click="emit('close')">×</button></div>
      <h2>{{ title }}</h2>
      <p>来源：{{ fileName }} · 第 {{ recordIndex }} 条数据 · 原表头 {{ header }}。记录索引不是物理行号。</p>
      <dl class="iw-value-pair"><div><dt>原始内容</dt><dd>{{ originalValue === '' ? '空值（待补充）' : originalValue }}</dd></div><div><dt>当前内容</dt><dd>{{ currentValue === '' ? '空值（待补充）' : currentValue }}</dd></div></dl>
      <details><summary>查看需求原文</summary><pre>{{ requirementText }}</pre></details>
      <details><summary>查看原始 CSV</summary><pre>{{ csvText }}</pre></details>
      <button type="button" class="secondary-button" @click="emit('close')">返回核对</button>
    </section>
  </div>
</template>
