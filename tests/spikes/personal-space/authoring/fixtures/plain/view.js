(function () {
  const draft = document.getElementById('draft')
  const status = document.getElementById('status')
  window.PersonalSpace.subscribe(snapshot => { draft.value = snapshot.draft; status.textContent = 'Ready' })
  window.PersonalSpace.connect().catch(error => { status.textContent = error.code || 'Unavailable' })
  document.getElementById('save').addEventListener('click', async () => {
    status.textContent = 'Saving'
    try { await window.PersonalSpace.saveDraft(draft.value); status.textContent = 'Saved' }
    catch (error) { status.textContent = error.code || 'Save failed' }
  })
})()
