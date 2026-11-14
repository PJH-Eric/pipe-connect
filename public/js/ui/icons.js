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

// 顏色加亮／加深（給管子做出圓柱的明暗）
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

let svgSeq = 0;

/**
 * 一節水管的 2D 示意圖（說明頁、首頁標誌用），造型跟 3D 盤面一致：
 * 倒邊陶瓷磚、圓弧彎管、金屬漸層管身、接頭凸緣與束環；水龍頭有黃銅手輪、出水接頭與白色箭頭。
 * @param mask 開口；opts：{ color 水的顏色或 null（沒水＝銀灰金屬）, locked, src }
 */
export function pipeSvg(mask, { color = null, locked = false, src = false, size = 64 } = {}) {
  const id = 'p' + ++svgSeq;
  const base = color || '#a9b6c2';
  const dark = shade(base, -0.45), mid = shade(base, -0.12), light = shade(base, 0.45);
  const open = [N, E, S, W].filter((b) => mask & b);
  const k = open.length;
  const isElbow = k === 2 && !(mask === (N | S) || mask === (E | W));
  const vec = (bit) => [(END[bit][0] - 50) / 50, (END[bit][1] - 50) / 50];

  // 管身路徑：彎管走圓弧，其餘從中心往各開口
  let path = '';
  if (isElbow && !src) {
    const [a, b] = open.map(vec);
    path = `M${50 + a[0] * 50} ${50 + a[1] * 50}L${50 + a[0] * 27} ${50 + a[1] * 27}Q50 50 ${50 + b[0] * 27} ${50 + b[1] * 27}L${50 + b[0] * 50} ${50 + b[1] * 50}`;
  } else {
    path = open.map((bit) => `M50 50L${END[bit][0]} ${END[bit][1]}`).join('');
  }
  const tube = `<path d="${path}" stroke="${dark}" stroke-width="30" fill="none" stroke-linejoin="round"/>
<path d="${path}" stroke="${mid}" stroke-width="25" fill="none" stroke-linejoin="round"/>
<path d="${path}" stroke="${base}" stroke-width="17" fill="none" stroke-linejoin="round"/>
<path d="${path}" stroke="${light}" stroke-width="6" fill="none" stroke-linejoin="round" opacity=".8" transform="translate(-3.500 -3.500)"/>`;

  // 接頭：靠邊一圈凸緣、往內一圈細束環
  const ring = (bit, at, half, thick, fill) => {
    const [ux, uy] = vec(bit);
    const cx = 50 + ux * at, cy = 50 + uy * at;
    return ux === 0
      ? `<rect x="${50 - half}" y="${cy - thick / 2}" width="${half * 2}" height="${thick}" rx="2.500" fill="${fill}" stroke="${dark}" stroke-width="1.500"/>`
      : `<rect x="${cx - thick / 2}" y="${50 - half}" width="${thick}" height="${half * 2}" rx="2.500" fill="${fill}" stroke="${dark}" stroke-width="1.500"/>`;
  };
  const brass = `url(#${id}b)`;
  let rings = open.map((bit) => ring(bit, 44, 18, 9, src ? brass : mid) + (src ? '' : ring(bit, 34, 15.500, 5, base))).join('');

  // 中心：水龍頭、端點的圓蓋、三通／十字的球形接頭
  let hub = '';
  if (src) {
    const arrows = open.map((bit) => {
      const [ux, uy] = vec(bit);
      const tx = 50 + ux * 47, ty = 50 + uy * 47, bx = 50 + ux * 35, by = 50 + uy * 35;
      return `<path d="M${tx} ${ty}L${bx - uy * 7.500} ${by + ux * 7.500}L${bx + uy * 7.500} ${by - ux * 7.500}Z" fill="#fff" stroke="${dark}" stroke-width="1.500" stroke-linejoin="round"/>`;
    }).join('');
    hub = `<circle cx="50" cy="50" r="28" fill="url(#${id}r)" stroke="${dark}" stroke-width="3"/>
<circle cx="50" cy="50" r="16" fill="none" stroke="#8a5a00" stroke-width="7"/><circle cx="50" cy="50" r="16" fill="none" stroke="${brass}" stroke-width="4.500"/>
<path d="M50 34V66M34 50H66" stroke="#8a5a00" stroke-width="5.500" stroke-linecap="round"/><path d="M50 34V66M34 50H66" stroke="#ffd36b" stroke-width="3" stroke-linecap="round"/>
<circle cx="50" cy="50" r="5" fill="#ffd36b" stroke="#8a5a00" stroke-width="2"/>${arrows}`;
  } else if (k === 1) {
    hub = `<circle cx="50" cy="50" r="20" fill="url(#${id}r)" stroke="${dark}" stroke-width="3"/><circle cx="50" cy="50" r="9" fill="${mid}" stroke="${dark}" stroke-width="2"/><circle cx="44" cy="43" r="4" fill="#fff" opacity=".6"/>`;
  } else if (k >= 3) {
    hub = `<circle cx="50" cy="50" r="17" fill="url(#${id}r)" stroke="${dark}" stroke-width="2.500"/><circle cx="45" cy="44" r="4" fill="#fff" opacity=".55"/>`;
  }

  const rivets = locked
    ? [[15, 15], [85, 15], [15, 85], [85, 85]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#c9ced4" stroke="#3d3833" stroke-width="1.500"/><circle cx="${x - 1.500}" cy="${y - 1.500}" r="1.600" fill="#fff"/>`).join('')
    : '';
  const tileTop = locked ? '#857b71' : '#f4f8fb', tileBot = locked ? '#5f574f' : '#d4dee7';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
<defs>
<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tileTop}"/><stop offset="1" stop-color="${tileBot}"/></linearGradient>
<radialGradient id="${id}r" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${mid}"/></radialGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#f2b53a"/><stop offset="1" stop-color="#b9801a"/></linearGradient>
</defs>
<rect x="2.500" y="2.500" width="95" height="95" rx="14" fill="#0c1c2e"/>
<rect x="4" y="4" width="92" height="92" rx="12" fill="url(#${id}t)"/>
<rect x="5.500" y="5.500" width="89" height="89" rx="11" fill="none" stroke="#fff" stroke-opacity="${locked ? 0.18 : 0.7}" stroke-width="1.500"/>
${rivets}${tube}${rings}${hub}</svg>`;
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
