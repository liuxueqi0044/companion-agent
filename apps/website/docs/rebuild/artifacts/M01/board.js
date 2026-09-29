import { getBoard, modes, scenes } from './source/board-layouts.mjs';

const params = new URLSearchParams(location.search);
let currentMode = modes[params.get('mode')] ? params.get('mode') : 'desktop';
const sceneParam = params.get('scene');
const observers = [];

const el = (name, className, content) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};

function createBoard(sceneName, mode) {
  const layout = getBoard(sceneName, mode);
  const wrapper = el('div', 'board-wrap');
  wrapper.dataset.mode = mode;
  wrapper.style.aspectRatio = `${layout.width}/${layout.height}`;
  const board = el('article', `board board-${sceneName}`);
  board.lang = 'en';
  board.style.width = `${layout.width}px`;
  board.style.height = `${layout.height}px`;
  board.style.background = layout.background;
  board.setAttribute('aria-label', `${sceneName}: ${layout.label}`);
  const art = el('img', 'board-art');
  art.src = layout.art.src;
  art.alt = sceneName === 'hero' ? 'Six skill tags suspended from sunlit botanical branches.' : sceneName === 'gallery' ? 'Many different AI assistant interface concepts in a layered, flowing gallery.' : 'Three creative works shared among five illustrated people.';
  art.width = 1774;
  art.height = 887;
  Object.assign(art.style, { left: `${layout.art.x}px`, top: `${layout.art.y}px`, width: `${layout.art.w}px`, height: `${layout.art.h}px` });
  if (layout.art.fadeTop || layout.art.fadeBottom) {
    art.style.maskImage = `linear-gradient(to bottom,transparent 0,#000 ${layout.art.fadeTop || 0}px,#000 calc(100% - ${layout.art.fadeBottom || 0}px),transparent 100%)`;
  }
  board.append(art);

  for (const veil of layout.veils) {
    const overlay = el('div');
    Object.assign(overlay.style, { position: 'absolute', left: `${veil.x}px`, top: `${veil.y}px`, width: `${veil.w}px`, height: `${veil.h}px`, background: `linear-gradient(to bottom, ${veil.start}, ${veil.start} 22%, transparent)`, opacity: veil.opacity, pointerEvents: 'none' });
    board.append(overlay);
  }
  for (const item of layout.pills) {
    const pill = el('span', 'board-pill', item.text);
    pill.setAttribute('aria-label', `${item.text} — visual design only`);
    Object.assign(pill.style, { left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px`, fontSize: `${item.size}px`, color: item.color, background: item.background, border: item.border ? `1px solid ${item.border}` : 'none' });
    board.append(pill);
  }
  for (const item of layout.texts) {
    const line = el('p', `board-text font-${item.font}`, item.text);
    Object.assign(line.style, { left: `${item.x}px`, top: `${item.y}px`, fontSize: `${item.size}px`, lineHeight: `${item.lineHeight}px`, color: item.color, fontWeight: item.weight || 400, letterSpacing: `${item.tracking || 0}px` });
    board.append(line);
  }
  wrapper.append(board);
  const resize = () => { board.style.transform = `scale(${wrapper.clientWidth / layout.width})`; };
  const observer = new ResizeObserver(resize);
  observer.observe(wrapper);
  observers.push(observer);
  resize();
  return wrapper;
}

function renderReview() {
  for (const observer of observers) observer.disconnect();
  observers.length = 0;
  const host = document.getElementById('scenes');
  host.replaceChildren();
  for (const [name, scene] of Object.entries(scenes)) {
    const section = el('section', 'scene-section');
    section.id = name;
    const heading = el('div', 'scene-heading');
    const title = el('div');
    title.append(el('p', 'section-index', `${scene.number} / ${scene.label}`), el('h2', '', scene.name));
    heading.append(title, el('p', 'scene-description', scene.description));
    section.append(heading, createBoard(name, currentMode));
    const footer = el('div', 'scene-footer');
    footer.append(el('span', currentMode === 'mobile' ? 'sketch-note' : '', currentMode === 'mobile' ? '手机构图草案：文字与场景重新排布，图层尚未拆分。' : modes[currentMode].label));
    const links = el('div', 'board-links');
    const pure = el('a', '', '打开独立画板 ↗');
    pure.href = `?scene=${name}&mode=${currentMode}`;
    pure.target = '_blank';
    const png = el('a', '', 'PNG 设计图 ↓');
    png.href = `boards/${name}-${currentMode}.png`;
    png.download = `MORROW-M01-${name}-${currentMode}.png`;
    links.append(pure, png);
    footer.append(links);
    section.append(footer);
    host.append(section);
  }
  document.getElementById('mode-note').textContent = modes[currentMode].note;
  for (const button of document.querySelectorAll('[data-mode][type="button"]')) button.setAttribute('aria-pressed', String(button.dataset.mode === currentMode));
}

if (scenes[sceneParam]) {
  document.body.classList.add('pure-mode');
  document.getElementById('review').hidden = true;
  const host = document.getElementById('pure-board');
  host.hidden = false;
  const board = createBoard(sceneParam, currentMode);
  host.append(board);
  const layout = modes[currentMode];
  const fit = () => {
    const scale = Math.min(window.innerWidth / layout.width, window.innerHeight / layout.height);
    board.style.width = `${layout.width * scale}px`;
    board.style.height = `${layout.height * scale}px`;
  };
  window.addEventListener('resize', fit, { passive: true });
  fit();
  document.title = `MORROW M01 — ${sceneParam} — ${layout.width}×${layout.height}`;
} else {
  renderReview();
  for (const button of document.querySelectorAll('[data-mode][type="button"]')) button.addEventListener('click', () => {
    currentMode = button.dataset.mode;
    renderReview();
    const url = new URL(location.href);
    url.searchParams.set('mode', currentMode);
    history.replaceState(null, '', url);
  });
}

await document.fonts.ready;
await Promise.allSettled([...document.querySelectorAll('.board-art')].map((img) => img.decode()));
document.documentElement.dataset.boardsReady = 'true';
