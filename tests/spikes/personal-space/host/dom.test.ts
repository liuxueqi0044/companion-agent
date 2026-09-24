import { it, expect } from 'vitest'
import { StableHost } from './state'
import page from './index.html?raw'
// The existing jsdom dependency lives in tests/spikes; avoid installing or changing root dependencies.
// @ts-expect-error existing local JS package has no declaration in this spike
import { JSDOM } from '../../node_modules/jsdom/lib/api.js'

it('plain engineering shell saves draft, exposes stop and restores state after reload', async () => {
  const dom = new JSDOM(page, { url:'http://localhost' })
  Object.assign(globalThis, { window:dom.window, document:dom.window.document,
    localStorage:dom.window.localStorage, Event:dom.window.Event })
  localStorage.clear()
  await import('./main')
  expect(document.querySelector('h1')?.textContent).toContain('非产品界面')
  const input = document.querySelector<HTMLTextAreaElement>('#host-draft')!
  input.value = 'fictional\nunfinished'
  input.dispatchEvent(new Event('input', { bubbles:true }))
  expect(new StableHost(localStorage).record.draft).toBe('fictional\nunfinished')
  document.querySelector<HTMLButtonElement>('#stop')!.click()
  expect(document.querySelector('#host-status')?.textContent).toContain('stopped')
  const reloaded = new StableHost(localStorage, undefined, new Set(['fixture-v1']))
  expect(reloaded.record.draft).toBe('fictional\nunfinished')
  expect(reloaded.record.tasks[0].status).toBe('unavailable')
})
