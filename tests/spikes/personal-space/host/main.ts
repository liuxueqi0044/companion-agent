import { StableHost } from './state'
import { MountCoordinator, type TrustedFixture } from './mount'
import manifestV1 from './fixture/manifest.json'
import artifactV1 from './fixture/artifact.html?raw'
import manifestV2 from './recovery-fixtures/v2/manifest.json'
import artifactV2 from './recovery-fixtures/v2/artifact.html?raw'

const trusted = new Map<string, TrustedFixture>([
  ['fixture-v1', { revision_id:'fixture-v1', artifact:artifactV1,
    artifact_hash:manifestV1.artifact_hash,
    expected_hash:'5a02e8248c3b84a9c6fd21727a99393d184733de04cac3a3651fe5ef4def0f48',
    source_type:'handwritten_fixture', host_api_version:'demo/1' }],
  ['fixture-v2', { revision_id:'fixture-v2', artifact:artifactV2,
    artifact_hash:manifestV2.artifact_hash,
    expected_hash:'e12f1f133581fea2cb4869b29dee2742da46a1c1217bd41251ac8a1d653c70f7',
    source_type:'handwritten_fixture', host_api_version:'demo/1' }],
])
const host = new StableHost(localStorage, undefined, new Set(trusted.keys()))
const slot = document.querySelector<HTMLDivElement>('#slot')!
const status = document.querySelector<HTMLElement>('#host-status')!
const draft = document.querySelector<HTMLTextAreaElement>('#host-draft')!
function render(message = '') {
  draft.value = host.record.draft
  status.textContent = JSON.stringify({ message, phase:host.phase, recovery:host.recoveryReason,
    personal_ai_id:host.record.personal_ai_id, session_id:host.record.session_id,
    active_revision:host.record.active_revision, tasks:host.record.tasks }, null, 2)
}
const mount = new MountCoordinator(host, slot, trusted,
  new Set(['read_demo_state','write_demo_draft']), render)

draft.addEventListener('input', () => {
  try { host.writeDraft(draft.value); mount.stateChanged(); render('draft_saved') }
  catch { render('draft_rejected') }
})
document.querySelector('#activate')!.addEventListener('click', () => {
  const next = host.record.active_revision === 'fixture-v1' ? 'fixture-v2' : 'fixture-v1'
  void mount.activate(next)
})
document.querySelector('#cancel')!.addEventListener('click', () => mount.cancel())
document.querySelector('#undo')!.addEventListener('click', () => { void mount.undo() })
document.querySelector('#stop')!.addEventListener('click', () => mount.stop())
document.querySelector('#recover')!.addEventListener('click', () => { void mount.recover() })
render()
if (host.record.active_revision) void mount.recover()
