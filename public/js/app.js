/* ===== app.js — 進入點：畫面切換、頂列、語言選單、設定彈窗 ===== */
import { h, Button, Switch, Slider, openModal, openMenu, closeMenu, menuOpenFor, closeAllModals, hasModal, icon } from './ui/kit.js';
import { ICONS } from './ui/icons.js';
import { t, initI18n, setLang, getLang, onLangChange, LANGS } from './i18n.js';
import { store, save, DEFAULT_SETTINGS } from './storage.js';
import { unlockAudio, applyVolumes, sfx } from './audio.js';
import { lobbyUrl } from './lobby-link.js';
import { homeScreen, levelsScreen, randomScreen, dailyScreen, helpScreen, statsScreen } from './ui/screens.js';
import { gameScreen } from './ui/game.js';

const SCREENS = { home: homeScreen, levels: levelsScreen, random: randomScreen, daily: dailyScreen, help: helpScreen, stats: statsScreen, game: gameScreen };
const $ = (id) => document.getElementById(id);
const app = $('app');
const main = $('main');
const btnLobby = $('btn-lobby'), btnBack = $('btn-back'), btnPause = $('btn-pause'), btnLang = $('btn-lang'), btnSettings = $('btn-settings');
const topTitle = $('top-title');

let current = null; // { name, params, api }

/* ---------- 畫面切換 ---------- */
const ctx = {
  go(name, params = {}, { replace = false } = {}) {
    const depth = replace ? history.state?.depth || 0 : (history.state?.depth || 0) + 1;
    const state = { name, params, depth };
    if (replace) history.replaceState(state, '');
    else history.pushState(state, '');
    sfx('click');
    render(state);
  },
  back() {
    if ((history.state?.depth || 0) > 0) history.back();
    else ctx.go('home', {}, { replace: true });
  },
  home() {
    const depth = history.state?.depth || 0;
    if (depth > 0) history.go(-depth);
    else ctx.go('home', {}, { replace: true });
  },
  setTitle(text) {
    topTitle.textContent = text;
  },
};

function render(state) {
  closeMenu();
  closeAllModals();
  current?.api.leave?.();
  const name = SCREENS[state.name] ? state.name : 'home';
  const api = SCREENS[name](state.params || {}, ctx);
  current = { name, params: state.params || {}, api };
  app.dataset.screen = name;
  main.replaceChildren(api.el);
  api.mounted?.();
  paintTopbar();
  main.querySelector('.sa-view, .stage')?.focus({ preventScroll: true });
  window.GameAnalytics?.pageView(name);
}

function paintTopbar() {
  const home = current.name === 'home';
  btnLobby.hidden = !home;
  btnBack.hidden = home;
  btnPause.hidden = current.name !== 'game';
  topTitle.textContent = current.api.title?.() || '';
  btnLobby.querySelector('.pill-text').textContent = t('top.lobby');
  $('overlays').setAttribute('aria-label', t('top.popups'));
  for (const [btn, key] of [[btnBack, 'top.back'], [btnPause, 'top.pause'], [btnLang, 'top.lang'], [btnSettings, 'top.settings']]) {
    btn.setAttribute('aria-label', t(key));
    btn.title = t(key);
  }
}

window.addEventListener('popstate', (ev) => render(ev.state || { name: 'home', params: {}, depth: 0 }));

/* ---------- 語言 ---------- */
btnLang.addEventListener('click', () => {
  if (menuOpenFor(btnLang)) return closeMenu();
  sfx('click');
  openMenu(btnLang, LANGS.map((l) => ({ id: l.id, label: l.label, lang: l.id })), { selected: getLang(), label: t('top.lang'), onPick: setLang });
});

onLangChange(() => {
  if (current.api.onLang) {
    current.api.onLang();
    paintTopbar();
  } else render({ name: current.name, params: current.params });
});

/* ---------- 設定 ---------- */
function openSettings() {
  if (hasModal()) return;
  sfx('click');
  const s = store().settings;
  const commit = () => {
    save();
    applyVolumes();
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    current.api.onSettings?.();
  };
  const row = (ico, key, control, extra) => h('div', { class: 'set-row' }, icon(ico), h('div', { class: 'set-text' }, h('b', null, t(key)), extra && h('span', null, t(extra))), control);
  const build = () => {
    const musicVol = Slider({ value: s.musicVol, label: t('set.musicVol'), disabled: !s.music, onChange: (v) => { s.musicVol = v; commit(); } });
    const sfxVol = Slider({ value: s.sfxVol, label: t('set.sfxVol'), disabled: !s.sfx, onChange: (v) => { s.sfxVol = v; commit(); sfx('turn'); } });
    return h('div', { class: 'set' },
      row('music', 'set.music', Switch({ checked: s.music, label: t('set.music'), onChange: (v) => { s.music = v; musicVol.setDisabled(!v); commit(); } })),
      h('div', { class: 'set-sub' }, h('span', null, t('set.volume')), musicVol),
      row('sound', 'set.sfx', Switch({ checked: s.sfx, label: t('set.sfx'), onChange: (v) => { s.sfx = v; sfxVol.setDisabled(!v); commit(); sfx('turn'); } })),
      h('div', { class: 'set-sub' }, h('span', null, t('set.volume')), sfxVol),
      row('moves', 'set.vibrate', Switch({ checked: s.vibrate, label: t('set.vibrate'), onChange: (v) => { s.vibrate = v; commit(); } }), 'set.vibrate.desc'),
      row('view', 'set.reduce', Switch({ checked: s.reduceMotion, label: t('set.reduce'), onChange: (v) => { s.reduceMotion = v; commit(); } }), 'set.reduce.desc'),
    );
  };
  const holder = h('div', null, build());
  const modal = openModal({
    title: t('set.title'),
    cls: 'modal-settings',
    closeLabel: t('set.close'),
    body: holder,
    actions: [
      Button({ ico: 'restart', label: t('set.reset'), onClick: () => { Object.assign(s, DEFAULT_SETTINGS); commit(); holder.replaceChildren(build()); } }),
      Button({ ico: 'check', label: t('set.done'), variant: 'primary', onClick: () => modal.close() }),
    ],
  });
}

/* ---------- 啟動 ---------- */
function boot() {
  initI18n();
  document.documentElement.classList.toggle('reduce-motion', store().settings.reduceMotion);
  btnLobby.href = lobbyUrl();
  btnLobby.replaceChildren(h('span', { class: 'ico', 'aria-hidden': 'true', html: ICONS.lobby }), h('span', { class: 'pill-text' }));
  for (const [btn, ico] of [[btnBack, 'back'], [btnPause, 'pause'], [btnLang, 'globe'], [btnSettings, 'gear']]) btn.innerHTML = `<span class="ico" aria-hidden="true">${ICONS[ico]}</span>`;
  btnBack.addEventListener('click', () => ctx.back());
  btnPause.addEventListener('click', () => current.api.pause?.());
  btnSettings.addEventListener('click', openSettings);
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  const state = { name: 'home', params: {}, depth: 0 };
  history.replaceState(state, '');
  render(state);
  app.dataset.ready = '1';
}

boot();
