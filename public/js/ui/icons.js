/* ===== icons.js — 手繪向量圖示與水管示意圖（不用 emoji、不用圖示字型）===== */
const s = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  gear: s('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>'),
  globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'),
  pause: s('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  play: s('<path d="M8 5.5l10.5 6.5L8 18.5z" fill="currentColor"/>'),
  undo: s('<path d="M8 8H14.5a5 5 0 010 10H9"/><path d="M11 4.5L7.5 8 11 11.5"/>'),
  hint: s('<path d="M9 17.5h6M10 20.5h4"/><path d="M12 3.5a6 6 0 00-3.6 10.8c.6.5.9 1.1.9 1.8h5.4c0-.7.3-1.3.9-1.8A6 6 0 0012 3.5z"/>'),
  restart: s('<path d="M19.5 12a7.5 7.5 0 11-2.4-5.5"/><path d="M19.5 4v4h-4"/>'),
  plus: s('<path d="M12 5.5v13M5.5 12h13"/>'),
  minus: s('<path d="M5.5 12h13"/>'),
  view: s('<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/>'),
  lock: s('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>'),
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.8 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.8 3.2 1.3-6.5L2.6 9.4l6.6-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  home: s('<path d="M4 11l8-7 8 7"/><path d="M6.5 9.5V19.5h11V9.5"/>'),
  list: s('<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>'),
  next: s('<path d="M9 5l7 7-7 7"/>'),
  calendar: s('<rect x="4" y="5.5" width="16" height="14.5" rx="2.4"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  dice: s('<rect x="4" y="4" width="16" height="16" rx="3.4"/><circle cx="8.6" cy="8.6" r="1" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15.4" cy="8.6" r="1" fill="currentColor"/><circle cx="8.6" cy="15.4" r="1" fill="currentColor"/>'),
  flag: s('<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.8 2.2 3.8H6"/>'),
  help: s('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 115 1.4c-.7 1-2.3 1.4-2.3 3"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  trophy: s('<path d="M7.5 4h9v5a4.5 4.5 0 01-9 0z"/><path d="M7.5 6H4.5c0 3 1.2 4.4 3.4 4.6M16.5 6h3c0 3-1.2 4.4-3.4 4.6M12 13.5v4M8.5 20.5h7M9.5 17.5h5"/>'),
  flame: s('<path d="M12 3c.6 3.4 4.8 5.2 4.8 9.8a4.8 4.8 0 01-9.6 0c0-1.8.8-3 1.8-4 .3 1.6 1.2 2.4 2 2.6C10.400 9 10.800 6 12 3z"/>'),
  wrap: s('<path d="M4 9h13.500L14.500 6M20 15H6.500l3 3"/>'),
  drop: s('<path d="M12 3.2c3.2 4 5.6 6.900 5.6 10.300a5.6 5.6 0 01-11.200 0C6.400 10.100 8.800 7.200 12 3.200z"/>'),
  moves: s('<path d="M18.500 12a6.500 6.500 0 11-2-4.700"/><path d="M18.500 4.500v4h-4"/><circle cx="12" cy="12" r="1.300" fill="currentColor"/>'),
  clock: s('<circle cx="12" cy="12.500" r="8"/><path d="M12 8v4.800l3 1.800M9.500 2.800h5"/>'),
  music: s('<path d="M9 17.500V5.500l10-2v12"/><circle cx="6.500" cy="17.500" r="2.500"/><circle cx="16.500" cy="15.500" r="2.500"/>'),
  sound: s('<path d="M4 9.500h3.500L12 5.500v13l-4.500-4H4z"/><path d="M15.500 9a4.500 4.500 0 010 6M18 6.500a8 8 0 010 11"/>'),
  lobby: s('<path d="M4 11l8-7 8 7"/><rect x="6.500" y="11" width="11" height="8.500" rx="1.500"/><path d="M10.500 19.500v-4h3v4"/>'),
  colors: s('<circle cx="8.500" cy="9" r="4.500"/><circle cx="15.500" cy="9" r="4.500"/><circle cx="12" cy="15" r="4.500"/>'),
};

const N = 1, E = 2, S = 4, W = 8;
const END = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };

/**
 * 一節水管的 2D 示意圖（說明頁、首頁標誌用）。
 * @param mask 開口；opts：{ color 水的顏色或 null, locked, src }
 */
export function pipeSvg(mask, { color = null, locked = false, src = false, size = 64 } = {}) {
  const pipe = color || '#9aa7b4';
  const edge = color ? 'rgba(0,0,0,.28)' : '#6f7c88';
  let arms = '';
  let flanges = '';
  for (const bit of [N, E, S, W]) {
    if (!(mask & bit)) continue;
    const [x, y] = END[bit];
    arms += `M50 50L${x} ${y}`;
    const fx = 50 + (x - 50) * 0.86, fy = 50 + (y - 50) * 0.86;
    flanges += x === 50 ? `<rect x="33" y="${fy - 5}" width="34" height="10" rx="3"/>` : `<rect x="${fx - 5}" y="33" width="10" height="34" rx="3"/>`;
  }
  let spouts = '';
  if (src) {
    for (const bit of [N, E, S, W]) {
      if (!(mask & bit)) continue;
      const [x, y] = END[bit];
      const ux = (x - 50) / 50, uy = (y - 50) / 50;
      const cx = 50 + ux * 40, cy = 50 + uy * 40;
      spouts += ux === 0 ? `<rect x="31" y="${cy - 7}" width="38" height="14" rx="4" fill="#f2b53a" stroke="#8a5a00" stroke-width="2.500"/>` : `<rect x="${cx - 7}" y="31" width="14" height="38" rx="4" fill="#f2b53a" stroke="#8a5a00" stroke-width="2.500"/>`;
      const tx = 50 + ux * 47, ty = 50 + uy * 47, bx = 50 + ux * 36, by = 50 + uy * 36;
      spouts += `<path d="M${tx} ${ty}L${bx - uy * 7} ${by + ux * 7}L${bx + uy * 7} ${by - ux * 7}Z" fill="#fff"/>`;
    }
  }
  const count = [N, E, S, W].filter((b) => mask & b).length;
  const hub = src
    ? // 水龍頭：圓形水塔＋黃銅手輪；出水口有黃銅接頭和往外的白色箭頭
      `${spouts}<circle cx="50" cy="50" r="27" fill="${pipe}" stroke="${edge}" stroke-width="4"/><circle cx="50" cy="50" r="15" fill="none" stroke="#f2b53a" stroke-width="5"/><path d="M50 35V65M35 50H65" stroke="#f2b53a" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="50" r="5" fill="#fff"/>`
    : count === 1
      ? `<circle cx="50" cy="50" r="19" fill="${pipe}" stroke="${edge}" stroke-width="4"/><circle cx="44" cy="44" r="5" fill="#fff" opacity=".55"/>`
      : '';
  const rivets = locked ? [[14, 14], [86, 14], [14, 86], [86, 86]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#4a423b"/>`).join('') : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
<rect x="3" y="3" width="94" height="94" rx="12" fill="${locked ? '#8a8076' : '#e4ecf2'}" stroke="#1d3147" stroke-width="3"/>
<path d="${arms}" stroke="${edge}" stroke-width="30" stroke-linecap="butt" fill="none"/>
<path d="${arms}" stroke="${pipe}" stroke-width="22" stroke-linecap="round" fill="none"/>
<path d="${arms}" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".35" transform="translate(-4 -4)"/>
<g fill="${edge}">${flanges}</g>${hub}${rivets}</svg>`;
}

/** 首頁標誌：一排接通的水管 */
export function logoSvg() {
  const tiles = [
    [E, { src: true, color: '#2f9bff' }],
    [W | S | E, { color: '#2f9bff' }],
    [W | S, { color: '#2f9bff' }],
    [E, { color: '#2f9bff' }],
    [W | N | E, { color: '#2f9bff' }],
    [W | N, { color: '#2f9bff' }],
  ];
  return `<div class="logo-grid" aria-hidden="true">${tiles.map(([m, o], i) => `<span class="logo-tile" style="--i:${i}">${pipeSvg(m, { ...o, size: 100 })}</span>`).join('')}</div>`;
}
