// Handwritten local engineering fixture. No network calls or external resources.
let port = null;
let binding = null;
window.addEventListener('message', (event) => {
  if (port || event.source !== window.parent || !event.data || event.data.type !== 'personal-space-init'
      || event.ports.length !== 1) return;
  binding = event.data;
  port = event.ports[0];
  port.onmessage = (message) => {
    const data = message.data;
    if (!data || data.channel_id !== binding.channel_id || data.revision_id !== binding.revision_id
        || data.request_id !== binding.request_id) return;
    if (data.method === 'read_demo_state' && data.ok) {
      document.getElementById('fixture-draft').value = data.data.draft;
      document.getElementById('fixture-status').textContent = '宿主状态：' + data.data.tasks[0].status;
    }
    if (data.method === 'write_demo_draft' && data.ok)
      document.getElementById('fixture-status').textContent = '已保存虚构输入';
    if (data.method === 'host_state_changed') {
      document.getElementById('fixture-draft').value = data.payload.draft;
      document.getElementById('fixture-status').textContent = '宿主状态：' + data.payload.tasks[0].status;
    }
  };
  const send = (method, payload) => port.postMessage({ channel_id:binding.channel_id,
    revision_id:binding.revision_id, request_id:binding.request_id, method, payload });
  send('ready', { artifact_hash:binding.artifact_hash, base_revision:binding.base_revision });
  send('read_demo_state', {});
  document.getElementById('fixture-save').addEventListener('click', () => {
    send('write_demo_draft', { draft:document.getElementById('fixture-draft').value });
  });
}, { once:true });
