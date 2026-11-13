/* ===== kit.js — 自繪 UI 元件（按鈕、開關、滑桿、捲動區、彈窗、選單、分頁）=====
 * 內部保留語意標籤與 ARIA，外觀與互動全部自己畫，不露出瀏覽器預設控制項。
 */
import { ICONS } from './icons.js';

/** 建立元素：h('div', { class: 'x', onclick }, child, ...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function icon(name, cls = '') {
  return h('span', { class: 'ico ' + cls, 'aria-hidden': 'true', html: ICONS[name] || '' });
}

/** 按鈕。variant：primary（主要）、soft（次要）、ghost（透明）、danger */
export function Button({ label, ico, variant = 'soft', size = '', onClick, attrs = {}, badge }) {
  return h(
    'button',
    { type: 'button', class: `btn btn-${variant} ${size ? 'btn-' + size : ''}`, onclick: onClick, ...attrs },
    ico && icon(ico),
    label != null && h('span', { class: 'btn-label' }, label),
    badge != null && h('span', { class: 'btn-badge' }, badge),
  );
}

/** 只有圖示的按鈕（一定要給 label 當無障礙名稱） */
export function IconButton({ ico, label, onClick, cls = '', attrs = {} }) {
  return h('button', { type: 'button', class: 'icon-btn ' + cls, 'aria-label': label, title: label, onclick: onClick, ...attrs }, icon(ico));
}

/** 開關 */
export function Switch({ checked, label, onChange }) {
  const btn = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label }, h('span', { class: 'switch-knob' }));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}

/** 滑桿（0～1），可拖曳、可用方向鍵 */
export function Slider({ value, label, onChange, disabled = false }) {
  const fill = h('span', { class: 'slider-fill' });
  const knob = h('span', { class: 'slider-knob' });
  const root = h('div', { class: 'slider', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { class: 'slider-track' }, fill), knob);
  let v = value;
  const paint = () => {
    const pct = Math.round(v * 100);
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    root.setAttribute('aria-valuenow', String(pct));
    root.setAttribute('aria-valuetext', pct + '%');
  };
  const set = (nv, fire = true) => {
    nv = Math.min(1, Math.max(0, Math.round(nv * 20) / 20));
    if (nv === v) return;
    v = nv;
    paint();
    if (fire) onChange(v);
  };
  const fromEvent = (ev) => {
    const r = root.getBoundingClientRect();
    set((ev.clientX - r.left) / r.width);
  };
  root.addEventListener('pointerdown', (ev) => {
    if (root.classList.contains('is-disabled')) return;
    root.setPointerCapture(ev.pointerId);
    fromEvent(ev);
    const move = (e) => fromEvent(e);
    const up = () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  });
  root.addEventListener('keydown', (ev) => {
    if (root.classList.contains('is-disabled')) return;
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05, PageUp: 0.2, PageDown: -0.2 }[ev.key];
    if (step) set(v + step);
    else if (ev.key === 'Home') set(0);
    else if (ev.key === 'End') set(1);
    else return;
    ev.preventDefault();
  });
  root.setDisabled = (d) => {
    root.classList.toggle('is-disabled', d);
    root.setAttribute('aria-disabled', String(d));
    root.tabIndex = d ? -1 : 0;
  };
  root.setValue = (nv) => set(nv, false);
  root.setDisabled(disabled);
  paint();
  return root;
}

/** 自繪捲軸的捲動區：內容超出才出現捲軸，可拖曳、可點軌道、可用鍵盤 */
export function ScrollArea(content, { cls = '', label } = {}) {
  const view = h('div', { class: 'sa-view', tabindex: '0', role: 'region', 'aria-label': label || null }, content);
  const thumb = h('div', { class: 'sa-thumb' });
  const track = h('div', { class: 'sa-track', 'aria-hidden': 'true' }, thumb);
  const root = h('div', { class: 'sa ' + cls }, view, track);
  const refresh = () => {
    const { scrollHeight: sh, clientHeight: ch, scrollTop: st } = view;
    const over = sh - ch > 1;
    root.classList.toggle('has-scroll', over);
    if (!over) return;
    const th = track.clientHeight;
    const size = Math.max(36, (ch / sh) * th);
    thumb.style.height = size + 'px';
    thumb.style.transform = `translateY(${(st / (sh - ch)) * (th - size)}px)`;
  };
  view.addEventListener('scroll', refresh, { passive: true });
  const ro = new ResizeObserver(refresh);
  ro.observe(view);
  if (content && content.nodeType === 1) ro.observe(content);
  thumb.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    thumb.setPointerCapture(ev.pointerId);
    const y0 = ev.clientY, s0 = view.scrollTop;
    const ratio = (view.scrollHeight - view.clientHeight) / Math.max(1, track.clientHeight - thumb.offsetHeight);
    const move = (e) => (view.scrollTop = s0 + (e.clientY - y0) * ratio);
    const up = () => {
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', up);
      thumb.removeEventListener('pointercancel', up);
      root.classList.remove('is-dragging');
    };
    root.classList.add('is-dragging');
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
    thumb.addEventListener('pointercancel', up);
  });
  track.addEventListener('pointerdown', (ev) => {
    const r = thumb.getBoundingClientRect();
    view.scrollBy({ top: (ev.clientY < r.top ? -1 : 1) * view.clientHeight * 0.85, behavior: 'smooth' });
  });
  root.view = view;
  root.refresh = refresh;
  requestAnimationFrame(refresh);
  return root;
}

/* ---------- 疊層：彈窗、選單、提示 ---------- */
const layer = () => document.getElementById('overlays');
const FOCUSABLE = 'button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';
const modalStack = [];

/**
 * 開啟彈窗（遮罩、焦點鎖定、Esc 關閉、關閉後焦點回到原處）。
 * @returns { close(), root, body }
 */
export function openModal({ title, body, actions = [], cls = '', closable = true, closeLabel = '', onClose, labelledBy }) {
  const prev = document.activeElement;
  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 8);
  const closeBtn = closable && IconButton({ ico: 'close', label: closeLabel, cls: 'modal-x', onClick: () => api.close() });
  const head = h('div', { class: 'modal-head' }, h('h2', { class: 'modal-title', id: titleId }, title), closeBtn);
  const bodyWrap = ScrollArea(h('div', { class: 'modal-body' }, body), { cls: 'modal-scroll' });
  const foot = actions.length ? h('div', { class: 'modal-foot' }, actions) : null;
  const dialog = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledBy || titleId, tabindex: '-1' }, head, bodyWrap, foot);
  const root = h('div', { class: 'modal-backdrop ' + (cls ? cls + '-backdrop' : '') }, dialog);
  let closed = false;
  const api = {
    root,
    dialog,
    close(reason) {
      if (closed) return;
      closed = true;
      root.removeEventListener('keydown', onKey);
      root.remove();
      modalStack.splice(modalStack.indexOf(api), 1);
      document.getElementById('app').inert = modalStack.length > 0 ? true : false;
      if (prev && prev.isConnected) prev.focus({ preventScroll: true });
      onClose?.(reason);
    },
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape' && closable) {
      ev.stopPropagation();
      api.close('escape');
    } else if (ev.key === 'Tab') {
      const list = [...dialog.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetParent !== null);
      if (!list.length) return ev.preventDefault();
      const first = list[0], last = list[list.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  };
  root.addEventListener('keydown', onKey);
  root.addEventListener('pointerdown', (ev) => {
    if (ev.target === root && closable) api.close('backdrop');
  });
  layer().append(root);
  modalStack.push(api);
  document.getElementById('app').inert = true;
  const primary = dialog.querySelector('.modal-foot .btn-primary') || dialog.querySelector('.modal-body .btn-primary');
  (primary || dialog).focus({ preventScroll: true });
  return api;
}

export function hasModal() {
  return modalStack.length > 0;
}

export function closeAllModals() {
  [...modalStack].reverse().forEach((m) => m.close('nav'));
}

/** 下拉選單（單選清單），貼著 anchor 展開 */
export function openMenu(anchor, items, { selected, onPick, label }) {
  closeMenu();
  const list = h('div', { class: 'menu', role: 'listbox', 'aria-label': label, tabindex: '-1' });
  items.forEach((it) => {
    const opt = h('button', { type: 'button', class: 'menu-item', role: 'option', 'aria-selected': String(it.id === selected), lang: it.lang || null }, h('span', { class: 'menu-check' }, it.id === selected ? icon('check') : null), it.label);
    opt.addEventListener('click', () => {
      closeMenu();
      onPick(it.id);
    });
    list.append(opt);
  });
  const r = anchor.getBoundingClientRect();
  list.style.top = r.bottom + 6 + 'px';
  list.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  layer().append(list);
  anchor.setAttribute('aria-expanded', 'true');
  const opts = [...list.children];
  (opts.find((o) => o.getAttribute('aria-selected') === 'true') || opts[0]).focus();
  const onDoc = (ev) => {
    if (!list.contains(ev.target) && !anchor.contains(ev.target)) closeMenu();
  };
  const onKey = (ev) => {
    const idx = opts.indexOf(document.activeElement);
    if (ev.key === 'Escape') {
      closeMenu();
      anchor.focus();
    } else if (ev.key === 'ArrowDown') opts[(idx + 1) % opts.length].focus();
    else if (ev.key === 'ArrowUp') opts[(idx - 1 + opts.length) % opts.length].focus();
    else if (ev.key === 'Tab') closeMenu();
    else return;
    ev.preventDefault();
  };
  list.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('pointerdown', onDoc, true));
  window.addEventListener('resize', closeMenu, { once: true });
  activeMenu = { list, anchor, onDoc };
}

let activeMenu = null;
export function closeMenu() {
  if (!activeMenu) return;
  activeMenu.list.remove();
  activeMenu.anchor.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', activeMenu.onDoc, true);
  activeMenu = null;
}
export function menuOpenFor(anchor) {
  return !!activeMenu && activeMenu.anchor === anchor;
}

/** 分頁列 */
export function Tabs({ items, value, onChange, label }) {
  const root = h('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const btns = items.map((it) => {
    const b = h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(it.id === value), tabindex: it.id === value ? '0' : '-1', 'data-id': it.id }, h('span', { class: 'tab-label' }, it.label), it.sub != null && h('span', { class: 'tab-sub' }, it.sub));
    b.addEventListener('click', () => select(it.id, true));
    return b;
  });
  const select = (id, fire) => {
    btns.forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    if (fire) onChange(id);
  };
  root.addEventListener('keydown', (ev) => {
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    ev.preventDefault();
    const nb = btns[(i + d + btns.length) % btns.length];
    nb.focus();
    select(nb.dataset.id, true);
  });
  root.append(...btns);
  return root;
}

/** 短暫提示訊息 */
let toastTimer = 0;
export function toast(text, ico) {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    layer().append(box);
  }
  box.replaceChildren(...(ico ? [icon(ico)] : []), h('span', null, text));
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 2200);
}

/** 星星列 */
export function Stars(n, { size = '', max = 3 } = {}) {
  const row = h('span', { class: 'stars ' + size, role: 'img', 'aria-label': `${n}/${max}` });
  for (let i = 0; i < max; i++) row.append(icon('star', i < n ? 'on' : 'off'));
  return row;
}

/** 秒數 → m:ss */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
