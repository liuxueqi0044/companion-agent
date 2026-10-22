export const modes = {
  desktop: { width: 1920, height: 960, label: '1920 × 960 · 英文视觉母版', note: '完整构图 · English master' },
  wide: { width: 1440, height: 900, label: '1440 × 900 · 重排预览', note: '调整文案与画面比例 · Laptop composition' },
  mobile: { width: 390, height: 844, label: '390 × 844 · 手机构图草案', note: '独立排布 · 待分层，非最终手机设计' },
};

export const scenes = {
  hero: { number: '01', name: '枝叶上的能力', label: 'SKILLS, WITH ROOM TO GROW', description: '左侧枝叶形成主视觉，右侧保留安静留白。技能卡片清晰可见，首屏文案直接说明产品。', asset: 'hero-art-v1.png' },
  gallery: { number: '02', name: '一个助手，多种形态', label: 'A WORLD OF POSSIBILITIES', description: '大量界面同时存在，近、中、远三层组织空间。英文标题留在画面上方，主体界面保持完整。', asset: 'gallery-art-v1.png' },
  community: { number: '03', name: '与全世界分享创意', label: 'IDEAS, SHARED WITH THE WORLD', description: '三件作品与五位插画人物组成开放的创意空间。分享、交流、购买与出售通过作品直接表达。', asset: 'community-art-v1.png' },
};

const INK = '#292b22';
const MUTED = '#666a5a';
const OLIVE = '#535d42';

export function getBoard(scene, mode = 'desktop') {
  const preset = modes[mode] || modes.desktop;
  const board = { ...preset, scene, mode, background: '#f1ecdf', art: {}, texts: [], pills: [], veils: [] };
  const text = (value, x, y, size, lineHeight, font = 'sans', extra = {}) => {
    value.split('\n').forEach((line, index) => board.texts.push({ text: line, x, y: y + index * lineHeight, size, lineHeight, font, color: INK, ...extra }));
  };
  const pill = (value, x, y, w, h, filled = false, size = 14) => board.pills.push({ text: value, x, y, w, h, size, color: filled ? '#fbf8ee' : INK, background: filled ? OLIVE : 'rgba(247,244,235,0.45)', border: filled ? null : 'rgba(65,72,49,0.24)' });
  const src = `assets/${scenes[scene].asset}`;
  if (mode === 'desktop') {
    board.art = { src, x: 0, y: 0, w: 1920, h: 960 };
    text('MORROW', 68, 49, 21, 28, 'sans', { tracking: 4.1, weight: 600, color: scene === 'hero' ? '#f8f5e9' : INK });
    pill('Download', 1484, 34, 151, 54, true, 15);
    pill('Join community', 1650, 34, 203, 54, false, 15);
    if (scene === 'hero') {
      text('Build an AI\nthat’s yours.', 1252, 325, 98, 104, 'serif');
      text('Bring together skills, tools and agents.\nShape how it works—and how it feels.', 1258, 566, 21, 32, 'sans', { color: MUTED });
      text('SCROLL TO EXPLORE  ↓', 1400, 845, 11, 18, 'sans', { tracking: 2.1, color: MUTED });
    } else if (scene === 'gallery') {
      board.veils.push({ x: 0, y: 0, w: 1920, h: 202, direction: 'down', start: '#f4f0e6', opacity: 0.97 });
      text('One assistant. A world of possibilities.', 431, 97, 74, 84, 'serif');
      text('EXPLORE YOUR OWN EXPRESSION', 76, 885, 10, 18, 'sans', { tracking: 2.0, color: '#f9f5e9' });
    } else {
      text('Your ideas.\nA world to share.', 84, 296, 64, 70, 'serif');
      text('Share, discuss, buy and sell\nwhat you create.', 88, 493, 20, 31, 'sans', { color: MUTED });
      pill('Explore creations', 88, 594, 199, 54, true, 15);
      pill('Share your creation', 301, 594, 215, 54, false, 15);
    }
  } else if (mode === 'wide') {
    board.art = { src, x: scene === 'community' ? 65 : 0, y: 90, w: 1440, h: 720, fadeTop: 52, fadeBottom: 42 };
    text('MORROW', 52, 43, 18, 24, 'sans', { tracking: 3.7, weight: 600 });
    pill('Download', 1057, 28, 133, 48, true, 13);
    pill('Join community', 1204, 28, 182, 48, false, 13);
    if (scene === 'hero') {
      text('Build an AI\nthat’s yours.', 939, 321, 78, 85, 'serif');
      text('Bring together skills, tools and agents.\nShape how it works—and how it feels.', 944, 523, 17, 28, 'sans', { color: MUTED });
      text('SCROLL TO EXPLORE  ↓', 945, 811, 10, 18, 'sans', { tracking: 1.8, color: MUTED });
    } else if (scene === 'gallery') {
      board.veils.push({ x: 0, y: 82, w: 1440, h: 119, direction: 'down', start: '#f1ecdf', opacity: 0.94 });
      text('One assistant. A world of possibilities.', 334, 128, 54, 64, 'serif');
      text('EXPLORE YOUR OWN EXPRESSION', 56, 824, 10, 18, 'sans', { tracking: 1.8, color: MUTED });
    } else {
      text('Your ideas.\nA world to share.', 57, 310, 58, 65, 'serif');
      text('Share, discuss, buy and sell\nwhat you create.', 61, 479, 17, 28, 'sans', { color: MUTED });
      pill('Explore creations', 61, 574, 170, 48, true, 13);
      pill('Share your creation', 245, 574, 187, 48, false, 13);
    }
  } else {
    text('MORROW', 22, 28, 13, 18, 'sans', { tracking: 2.6, weight: 600 });
    pill('Download', 167, 19, 80, 34, true, 10);
    pill('Join community', 255, 19, 114, 34, false, 10);
    if (scene === 'hero') {
      board.art = { src, x: -5, y: 407, w: 650, h: 325, fadeTop: 28, fadeBottom: 22 };
      text('Build an AI\nthat’s yours.', 23, 111, 62, 66, 'serif');
      text('Bring together skills, tools and agents.\nShape how it works—and how it feels.', 26, 275, 15.7, 26, 'sans', { color: MUTED });
    } else if (scene === 'gallery') {
      board.art = { src, x: -205, y: 350, w: 825, h: 412.5, fadeTop: 40, fadeBottom: 36 };
      text('One assistant.\nA world of\npossibilities.', 23, 104, 46, 49, 'serif');
    } else {
      board.art = { src, x: -180, y: 411, w: 570, h: 285, fadeTop: 26, fadeBottom: 26 };
      text('Your ideas.\nA world to share.', 23, 106, 45, 53, 'serif');
      text('Share, discuss, buy and sell\nwhat you create.', 26, 243, 16, 25, 'sans', { color: MUTED });
      pill('Explore creations', 24, 322, 163, 43, true, 12);
      pill('Share your creation', 198, 322, 170, 43, false, 12);
    }
    text('MOBILE LAYOUT SKETCH', 24, 798, 9, 15, 'sans', { tracking: 1.5, color: '#777963' });
  }
  return board;
}
