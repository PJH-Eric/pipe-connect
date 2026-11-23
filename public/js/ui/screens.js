/* ===== screens.js — 首頁、選關、隨機、每日挑戰、玩法說明、成就與統計 ===== */
import { h, icon, Button, IconButton, ScrollArea, Tabs, Stars, toast, fmtTime } from './kit.js';
import { pipeSvg, logoSvg } from './icons.js';
import { t, getLang } from '../i18n.js';
import { store, save } from '../storage.js';
import { sfx } from '../audio.js';
import { DIFFS, LEVELS_PER_DIFF, HINTS, levelSpec, taipeiDateKey, shiftDateKey } from '../core/levels.js';
import {
  unlockedCount, clearedCount, starTotal, dailyDoneCount, dailyStreak, ACHIEVEMENTS,
} from '../core/progress.js';
import { newRandomSeed } from './game.js';

const prog = () => store().progress;

/** 難度的盤面大小說明，例如 5×5～7×7 */
function sizeRange(diff) {
  const a = levelSpec(diff, 0).w, b = levelSpec(diff, LEVELS_PER_DIFF - 1).w;
  return a === b ? `${a}×${a}` : `${a}×${a}～${b}×${b}`;
}

function diffFeatures(diff) {
  const last = levelSpec(diff, LEVELS_PER_DIFF - 1);
  const hints = HINTS[diff] === Infinity ? t('diff.hintsInf') : t('diff.hints', { n: HINTS[diff] });
  return [
    h('span', { class: 'tag' }, sizeRange(diff)),
    h('span', { class: 'tag' }, icon('hint'), hints),
    last.colors > 1 && h('span', { class: 'tag tag-colors' }, icon('colors'), t('diff.colors', { n: last.colors })),
    last.wrap && h('span', { class: 'tag tag-wrap' }, icon('wrap'), t('game.tagWrap')),
  ];
}

/** 難度卡片（隨機與每日挑戰共用） */
function DiffCard(diff, { status, onClick }) {
  return h('button', { type: 'button', class: `card diff-card diff-${diff}`, onclick: onClick },
    h('span', { class: 'diff-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'card-main' },
      h('span', { class: 'card-title' }, t('diff.' + diff)),
      h('span', { class: 'card-desc' }, t('diff.' + diff + '.desc')),
      h('span', { class: 'card-tags' }, diffFeatures(diff)),
    ),
    status ? h('span', { class: 'card-status' }, status) : icon('next', 'card-go'),
  );
}

const page = (cls, ...children) => ({ el: ScrollArea(h('div', { class: 'page ' + cls }, children), { cls: 'page-scroll' }) });

/* ---------- 首頁 ---------- */
export function homeScreen(params, ctx) {
  const p = prog();
  const today = taipeiDateKey();
  const stars = DIFFS.reduce((a, d) => a + starTotal(p, d), 0);
  const mode = (ico, key, badge, onClick, cls) =>
    h('button', { type: 'button', class: 'card mode-card ' + cls, onclick: onClick },
      h('span', { class: 'mode-ico' }, icon(ico)),
      h('span', { class: 'card-main' }, h('span', { class: 'card-title' }, t(key)), h('span', { class: 'card-desc' }, t(key + '.desc'))),
      badge && h('span', { class: 'card-status' }, badge),
    );
  const out = page('home',
    h('header', { class: 'hero' },
      h('div', { html: logoSvg() }),
      h('div', { class: 'hero-text' }, h('h1', { id: 'home-title' }, t('app.name')), h('p', null, t('app.tagline'))),
    ),
    h('nav', { class: 'home-modes', 'aria-label': t('home.modes') },
      mode('flag', 'home.campaign', h('span', { class: 'status-stars' }, icon('star', 'on'), String(stars)), () => ctx.go('levels'), 'mode-campaign'),
      mode('dice', 'home.random', null, () => ctx.go('random'), 'mode-random'),
      mode('calendar', 'home.daily', t('home.dailyBadge', { n: dailyDoneCount(p, today) }), () => ctx.go('daily'), 'mode-daily'),
    ),
    h('div', { class: 'home-more' },
      Button({ ico: 'help', label: t('home.help'), onClick: () => ctx.go('help') }),
      Button({ ico: 'trophy', label: t('home.stats'), onClick: () => ctx.go('stats') }),
    ),
  );
  return { ...out, title: () => '' };
}

/* ---------- 闖關選關 ---------- */
export function levelsScreen(params, ctx) {
  const p = prog();
  let diff = DIFFS.includes(store().last.diff) ? store().last.diff : 'tot';
  const grid = h('div', { class: 'level-grid' });
  const info = h('div', { class: 'levels-info' });
  const scroll = ScrollArea(grid, { cls: 'levels-scroll', label: t('levels.list') });

  const paint = () => {
    const open = unlockedCount(p, diff);
    info.replaceChildren(...[
      h('span', { class: 'levels-desc' }, t('diff.' + diff + '.desc')),
      h('span', { class: 'card-tags' }, diffFeatures(diff)),
      h('span', { class: 'levels-count' }, t('levels.cleared', { n: clearedCount(p, diff), total: LEVELS_PER_DIFF })),
      // 還沒全破就給一顆「繼續」，不用在 200 格裡找目前的關卡
      clearedCount(p, diff) < LEVELS_PER_DIFF && Button({ ico: 'play', label: t('levels.continue', { n: open }), variant: 'primary', attrs: { class: 'btn btn-primary levels-continue' }, onClick: () => ctx.go('game', { mode: 'campaign', diff, index: open - 1 }) }),
    ].filter(Boolean));
    grid.replaceChildren();
    let current = null;
    for (let i = 0; i < LEVELS_PER_DIFF; i++) {
      const stars = p.camp[diff].stars[i] || 0;
      const locked = i >= open;
      const isCurrent = i === open - 1 && !stars;
      const btn = h('button', {
        type: 'button',
        class: `level ${locked ? 'is-locked' : ''} ${isCurrent ? 'is-current' : ''} ${stars ? 'is-done' : ''}`,
        'aria-disabled': locked ? 'true' : null,
        tabindex: '-1',
        'aria-label': t(locked ? 'levels.ariaLocked' : 'levels.aria', { n: i + 1, s: stars }),
      }, h('span', { class: 'level-num' }, String(i + 1)), locked ? icon('lock', 'level-lock') : Stars(stars, { size: 'stars-xs' }));
      btn.addEventListener('click', () => {
        if (locked) {
          sfx('locked');
          toast(t('levels.lockedTip'), 'lock');
        } else ctx.go('game', { mode: 'campaign', diff, index: i });
      });
      if (isCurrent || (i === open - 1 && !current)) current = btn;
      grid.append(btn);
    }
    // 100 顆按鈕只留一個 Tab 停駐點，其餘用方向鍵移動
    (current || grid.firstElementChild).tabIndex = 0;
    requestAnimationFrame(() => {
      scroll.refresh();
      current?.scrollIntoView({ block: 'center' });
    });
  };

  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('levels.list'));
  grid.addEventListener('keydown', (ev) => {
    const btns = [...grid.children];
    const at = btns.indexOf(document.activeElement);
    if (at < 0) return;
    const cols = btns.filter((b) => b.offsetTop === btns[0].offsetTop).length || 1;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[ev.key];
    let to = at;
    if (step) to = at + step;
    else if (ev.key === 'Home') to = 0;
    else if (ev.key === 'End') to = btns.length - 1;
    else return;
    ev.preventDefault();
    if (to < 0 || to >= btns.length) return;
    btns[at].tabIndex = -1;
    btns[to].tabIndex = 0;
    btns[to].focus();
    btns[to].scrollIntoView({ block: 'nearest' });
  });

  const tabs = Tabs({
    label: t('levels.diffs'),
    value: diff,
    items: DIFFS.map((d) => ({ id: d, label: t('diff.' + d), sub: `${starTotal(p, d)}/${LEVELS_PER_DIFF * 3}` })),
    onChange: (id) => {
      diff = id;
      store().last.diff = id;
      save();
      sfx('click');
      paint();
    },
  });
  paint();
  return { el: h('div', { class: 'page levels' }, tabs, info, scroll), title: () => t('home.campaign') };
}

/* ---------- 隨機 ---------- */
export function randomScreen(params, ctx) {
  const p = prog();
  const out = page('pick',
    h('p', { class: 'page-lead' }, t('random.lead')),
    h('div', { class: 'card-list' }, DIFFS.map((d) => {
      const best = p.stats.randomBest[d];
      return DiffCard(d, {
        status: best ? h('span', { class: 'status-best' }, icon('clock'), fmtTime(best.s)) : null,
        onClick: () => ctx.go('game', { mode: 'random', diff: d, seed: newRandomSeed() }),
      });
    })),
  );
  return { ...out, title: () => t('home.random') };
}

/* ---------- 每日挑戰 ---------- */
function fmtDate(key, opts) {
  const locale = { 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN', en: 'en-US' }[getLang()];
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(new Date(key + 'T00:00:00Z'));
}

export function dailyScreen(params, ctx) {
  const p = prog();
  const today = taipeiDateKey();
  const day = p.daily[today] || {};
  const countdown = h('b', { class: 'daily-count' });
  const tickFn = () => {
    const now = Date.now() + 8 * 3600 * 1000;
    const left = 86400 - Math.floor((now / 1000) % 86400);
    countdown.textContent = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((n) => String(n).padStart(2, '0')).join(':');
    if (taipeiDateKey() !== today) ctx.go('daily', {}, { replace: true });
  };
  tickFn();
  const timer = setInterval(tickFn, 1000);

  // 月曆
  let month = today.slice(0, 7);
  const cal = h('div', { class: 'cal' });
  const paintCal = () => {
    const first = month + '-01';
    const startDow = new Date(first + 'T00:00:00Z').getUTCDay();
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const head = h('div', { class: 'cal-head' },
      IconButton({ ico: 'back', label: t('daily.prevMonth'), onClick: () => { month = shiftDateKey(first, -1).slice(0, 7); paintCal(); } }),
      h('b', null, fmtDate(first, { year: 'numeric', month: 'long' })),
      IconButton({ ico: 'next', label: t('daily.nextMonth'), attrs: { disabled: month >= today.slice(0, 7) ? '' : null }, onClick: () => { month = shiftDateKey(first, 32).slice(0, 7); paintCal(); } }),
    );
    const grid = h('div', { class: 'cal-grid', role: 'list', 'aria-label': fmtDate(first, { year: 'numeric', month: 'long' }) });
    for (let i = 0; i < 7; i++) grid.append(h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, fmtDate(shiftDateKey('2026-11-01', i), { weekday: 'narrow' })));
    for (let i = 0; i < startDow; i++) grid.append(h('span', { class: 'cal-pad', 'aria-hidden': 'true' }));
    for (let d = 1; d <= days; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      const n = dailyDoneCount(p, key);
      grid.append(h('span', { class: `cal-day ${key === today ? 'is-today' : ''} ${n ? 'has-done' : ''} ${n >= 5 ? 'is-full' : ''} ${key > today ? 'is-future' : ''}`, role: 'listitem', 'aria-label': t('daily.dayAria', { date: fmtDate(key, { month: 'long', day: 'numeric' }), n }) },
        h('span', { class: 'cal-num', 'aria-hidden': 'true' }, String(d)),
        h('span', { class: 'cal-dots', 'aria-hidden': 'true' }, DIFFS.map((x) => h('i', { class: p.daily[key]?.[x] ? 'on diff-' + x : '' }))),
      ));
    }
    cal.replaceChildren(head, grid);
  };
  paintCal();

  const out = page('pick daily',
    h('div', { class: 'daily-top' },
      h('div', { class: 'daily-date' }, icon('calendar'), h('b', null, fmtDate(today, { month: 'long', day: 'numeric', weekday: 'short' }))),
      h('div', { class: 'daily-chip' }, icon('flame'), t('daily.streak', { n: dailyStreak(p, today) })),
      h('div', { class: 'daily-chip' }, icon('clock'), h('span', null, t('daily.next')), countdown),
    ),
    h('p', { class: 'page-lead' }, t('daily.lead')),
    h('div', { class: 'daily-cols' },
      h('div', { class: 'card-list' }, DIFFS.map((d) => {
        const r = day[d];
        return DiffCard(d, {
          status: r ? h('span', { class: 'status-done' }, Stars(r.st, { size: 'stars-xs' }), h('span', null, t('daily.result', { m: r.m, t: fmtTime(r.s) }))) : null,
          onClick: () => ctx.go('game', { mode: 'daily', diff: d, dateKey: today }),
        });
      })),
      cal,
    ),
  );
  return { ...out, title: () => t('home.daily'), leave: () => clearInterval(timer) };
}

/* ---------- 玩法說明 ---------- */
export function helpScreen() {
  const fig = (mask, opts) => h('span', { class: 'help-fig', html: pipeSvg(mask, { size: 72, ...opts }) });
  const sec = (key, figs) => h('section', { class: 'help-sec' }, h('div', { class: 'help-figs' }, figs), h('div', null, h('h2', null, t(key)), h('p', null, t(key + '.body'))));
  const blue = '#2f9bff', orange = '#ff7a3d';
  const out = page('help',
    sec('help.goal', [fig(2, { src: true, color: blue }), fig(10, { color: blue }), fig(8, { color: blue })]),
    sec('help.turn', [fig(3), fig(6), fig(12)]),
    sec('help.kinds', [fig(1), fig(5), fig(3), fig(7), fig(15)]),
    sec('help.locked', [fig(5, { locked: true }), fig(6, { locked: true })]),
    sec('help.colors', [fig(2, { src: true, color: blue }), fig(8, { color: blue }), fig(2, { src: true, color: orange }), fig(8, { color: orange })]),
    sec('help.wrap', [fig(8, { color: blue }), fig(10), fig(2, { color: blue })]),
    sec('help.stars', [h('span', { class: 'help-stars' }, Stars(3, { size: 'stars-lg' }))]),
    sec('help.controls', [h('span', { class: 'help-keys' }, ['←↑↓→', 'Space', 'Z', 'H', '+ −', 'Esc'].map((k) => h('kbd', { class: 'key' }, k)))]),
  );
  return { ...out, title: () => t('home.help') };
}

/* ---------- 成就與統計 ---------- */
export function statsScreen() {
  const p = prog();
  const s = p.stats;
  const today = taipeiDateKey();
  const num = (ico, key, value) => h('div', { class: 'stat' }, icon(ico), h('b', null, value), h('span', null, t(key)));
  const hours = s.seconds >= 3600 ? `${Math.floor(s.seconds / 3600)}:${String(Math.floor((s.seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s.seconds % 60)).padStart(2, '0')}` : fmtTime(s.seconds);
  const got = ACHIEVEMENTS.filter((id) => p.ach[id]).length;
  const out = page('stats',
    h('div', { class: 'stat-grid' },
      num('check', 'stats.clears', String(s.clears)),
      num('moves', 'stats.taps', String(s.taps)),
      num('clock', 'stats.time', hours),
      num('hint', 'stats.hints', String(s.hints)),
      num('star', 'stats.perfect', String(s.perfect)),
      num('flame', 'stats.streak', `${dailyStreak(p, today)} / ${s.maxStreak}`),
    ),
    h('h2', { class: 'sec-title' }, t('stats.campaign')),
    h('div', { class: 'prog-list' }, DIFFS.map((d) => {
      const c = clearedCount(p, d);
      return h('div', { class: 'prog diff-' + d },
        h('span', { class: 'prog-name' }, h('span', { class: 'diff-dot' }), t('diff.' + d)),
        h('span', { class: 'prog-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(LEVELS_PER_DIFF), 'aria-valuenow': String(c), 'aria-label': t('diff.' + d) }, h('i', { style: { width: (c / LEVELS_PER_DIFF) * 100 + '%' } })),
        h('span', { class: 'prog-num' }, `${c}/${LEVELS_PER_DIFF}`),
        h('span', { class: 'prog-stars' }, icon('star', 'on'), String(starTotal(p, d))),
      );
    })),
    h('h2', { class: 'sec-title' }, t('stats.achievements'), h('span', { class: 'sec-count' }, `${got}/${ACHIEVEMENTS.length}`)),
    h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((id) =>
      h('div', { class: 'ach ' + (p.ach[id] ? 'is-on' : '') },
        h('span', { class: 'ach-ico' }, icon(p.ach[id] ? 'trophy' : 'lock')),
        h('span', { class: 'ach-text' }, h('b', null, t('ach.' + id)), h('span', null, t('ach.' + id + '.desc'))),
      ))),
  );
  return { ...out, title: () => t('home.stats') };
}
