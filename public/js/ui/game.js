/* ===== game.js — 遊戲畫面：3D 盤面＋資訊欄＋操作列＋暫停／結算彈窗 ===== */
import { h, icon, Button, IconButton, openModal, hasModal, toast, Stars, fmtTime } from './kit.js';
import { t } from '../i18n.js';
import { store, save } from '../storage.js';
import { sfx, vibrate } from '../audio.js';
import { PipeScene } from '../scene.js';
import { Session } from '../core/session.js';
import { kind } from '../core/rules.js';
import { campaignBoard, randomBoard, dailyBoard, LEVELS_PER_DIFF, taipeiDateKey } from '../core/levels.js';
import { recordResult } from '../core/progress.js';

function makeBoard(p) {
  if (p.mode === 'campaign') return campaignBoard(p.diff, p.index);
  if (p.mode === 'daily') return dailyBoard(p.diff, p.dateKey);
  return randomBoard(p.diff, p.seed);
}

export function newRandomSeed() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export function gameScreen(params, ctx) {
  let session = null;
  let scene = null;
  let resultModal = null;
  let pauseModal = null;
  let cursor = -1;
  let lastWet = 0;
  let winTimer = 0;
  let left = false;
  const analyticsKey = [params.mode, params.diff, params.index ?? params.dateKey ?? params.seed, Date.now()].join(':');

  /* ---------- 版面 ---------- */
  const elLabel = h('div', { class: 'hud-label' });
  const elTags = h('div', { class: 'hud-tags' });
  const chip = (ico, cls) => {
    const value = h('b', { class: 'chip-value' });
    const name = h('span', { class: 'chip-name' });
    return { root: h('div', { class: 'chip ' + cls }, icon(ico), h('span', { class: 'chip-text' }, name, value)), value, name };
  };
  const chipMoves = chip('moves', 'chip-moves');
  const chipTime = chip('clock', 'chip-time');
  const chipWet = chip('drop', 'chip-wet');
  const elWarn = h('div', { class: 'hud-warn', role: 'status', hidden: true });
  const hud = h('div', { class: 'hud' }, h('div', { class: 'hud-head' }, elLabel, elTags), h('div', { class: 'hud-chips' }, chipMoves.root, chipTime.root, chipWet.root), elWarn);

  const btnUndo = Button({ ico: 'undo', label: '', onClick: () => doUndo() });
  const btnHint = Button({ ico: 'hint', label: '', badge: '', onClick: () => doHint() });
  const btnRestart = Button({ ico: 'restart', label: '', onClick: () => restart() });
  const bar = h('div', { class: 'bar' }, btnUndo, btnHint, btnRestart);

  const stageHost = h('div', { class: 'stage-host' });
  const tip = h('div', { class: 'stage-tip' });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const btnZoomIn = IconButton({ ico: 'plus', label: '', onClick: () => scene.zoomBy(1.3) });
  const btnZoomOut = IconButton({ ico: 'minus', label: '', onClick: () => scene.zoomBy(1 / 1.3) });
  const btnView = IconButton({ ico: 'view', label: '', onClick: () => scene.resetView() });
  const zoom = h('div', { class: 'zoom' }, btnZoomIn, btnZoomOut, btnView);
  const stage = h('div', { class: 'stage', tabindex: '0', role: 'application' }, stageHost, tip, zoom, live);
  const el = h('div', { class: 'game' }, h('div', { class: 'game-side' }, hud, bar), stage);

  /* ---------- 文字（切換語言時重刷） ---------- */
  function title() {
    if (params.mode === 'campaign') return t('game.titleCampaign', { diff: t('diff.' + params.diff), n: params.index + 1 });
    if (params.mode === 'daily') return t('game.titleDaily', { diff: t('diff.' + params.diff) });
    return t('game.titleRandom', { diff: t('diff.' + params.diff) });
  }

  function refreshTexts() {
    ctx.setTitle(title());
    elLabel.textContent = title();
    const b = session.board;
    elTags.replaceChildren(...[
      h('span', { class: 'tag' }, `${b.w}×${b.h}`),
      b.colors > 1 && h('span', { class: 'tag tag-colors' }, icon('colors'), t('game.tagColors', { n: b.colors })),
      b.wrap && h('span', { class: 'tag tag-wrap' }, icon('wrap'), t('game.tagWrap')),
    ].filter(Boolean));
    chipMoves.name.textContent = t('game.moves');
    chipTime.name.textContent = t('game.time');
    chipWet.name.textContent = t('game.wet');
    btnUndo.querySelector('.btn-label').textContent = t('game.undo');
    btnHint.querySelector('.btn-label').textContent = t('game.hint');
    btnRestart.querySelector('.btn-label').textContent = t('game.restart');
    for (const [btn, key] of [[btnZoomIn, 'game.zoomIn'], [btnZoomOut, 'game.zoomOut'], [btnView, 'game.resetView']]) {
      btn.setAttribute('aria-label', t(key));
      btn.title = t(key);
    }
    stage.setAttribute('aria-label', t('game.boardAria'));
    const tips = [t('game.tipTap')];
    if (b.colors > 1) tips.push(t('game.tipColors'));
    if (b.wrap) tips.push(t('game.tipWrap'));
    tip.replaceChildren(...tips.map((x) => h('p', null, x)));
    refreshHud();
  }

  function refreshHud() {
    const f = session.flow;
    chipMoves.value.textContent = params.diff === 'tot' ? String(session.moves) : `${session.moves} / ${session.par}`;
    chipTime.value.textContent = fmtTime(session.seconds());
    chipWet.value.textContent = `${f.wet} / ${session.board.cells.length}`;
    btnUndo.disabled = !session.canUndo;
    btnHint.disabled = !session.canHint;
    btnHint.querySelector('.btn-badge').textContent = session.hintsLeft === Infinity ? '∞' : String(session.hintsLeft);
    elWarn.hidden = !f.mixed;
    elWarn.textContent = f.mixed ? t('game.mixed') : '';
    tip.hidden = session.started;
  }

  /* ---------- 開局／重來 ---------- */
  function begin() {
    clearTimeout(winTimer);
    session = new Session(makeBoard(params), params);
    lastWet = session.flow.wet;
    cursor = -1;
    scene.setBoard(session.board);
    scene.applyFlow(session.flow, { instant: true });
    refreshTexts();
    window.GameAnalytics?.reset();
    window.GameAnalytics?.start({ mode: 'solo', variant: params.mode, difficulty: params.diff });
  }

  function restart() {
    if (session.started && !session.done) window.GameAnalytics?.end({ result: 'dnf' });
    sfx('click');
    begin();
  }

  /* ---------- 操作 ---------- */
  function afterChange() {
    scene.applyFlow(session.flow);
    if (session.flow.wet > lastWet) sfx('water');
    lastWet = session.flow.wet;
    refreshHud();
    if (session.done) win();
  }

  function doTap(i) {
    if (!session || session.done || hasModal()) return;
    const r = session.tap(i);
    if (!r.ok) {
      if (r.reason === 'locked') {
        sfx('locked');
        vibrate(30);
        if (!store().last.lockedTipSeen) {
          store().last.lockedTipSeen = true;
          save();
          toast(t('game.lockedTip'), 'lock');
        }
      }
      return;
    }
    scene.turn(i, 1);
    sfx('turn');
    vibrate(8);
    afterChange();
  }

  function doUndo() {
    const i = session.undo();
    if (i < 0) return;
    scene.turn(i, -1);
    sfx('undo');
    afterChange();
  }

  function doHint() {
    const r = session.hint();
    if (r === -1) return;
    scene.setRot(r.i, 0);
    sfx('hint');
    setCursor(r.i);
    afterChange();
  }

  function setCursor(i) {
    cursor = i;
    scene.setCursor(i);
  }

  function describe(i) {
    const b = session.board;
    const c = b.cells[i];
    const color = session.flow.color[i];
    return [
      t('game.cellPos', { r: Math.floor(i / b.w) + 1, c: (i % b.w) + 1 }),
      c.src ? t('game.cellSource') : t('kind.' + kind(c.mask)),
      color < 0 ? t('game.cellMixed') : color > 0 ? t('game.cellWet') : t('game.cellDry'),
      c.locked ? t('game.cellLocked') : '',
    ].filter(Boolean).join(t('game.sep'));
  }

  function onKey(ev) {
    if (hasModal() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tag = ev.target?.closest?.('button,a,[role="slider"],[role="switch"]');
    const b = session.board;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (move) {
      if (tag && tag !== stage) return;
      let x = cursor < 0 ? 0 : cursor % b.w, y = cursor < 0 ? 0 : Math.floor(cursor / b.w);
      if (cursor >= 0) {
        x = b.wrap ? (x + move[0] + b.w) % b.w : Math.min(b.w - 1, Math.max(0, x + move[0]));
        y = b.wrap ? (y + move[1] + b.h) % b.h : Math.min(b.h - 1, Math.max(0, y + move[1]));
      }
      setCursor(y * b.w + x);
      live.textContent = describe(cursor);
    } else if ((ev.key === ' ' || ev.key === 'Enter') && cursor >= 0 && (!tag || tag === stage)) {
      doTap(cursor);
      live.textContent = describe(cursor);
    } else if (ev.key === 'z' || ev.key === 'Z' || ev.key === 'Backspace') doUndo();
    else if (ev.key === 'h' || ev.key === 'H') doHint();
    else if (ev.key === '+' || ev.key === '=') scene.zoomBy(1.3);
    else if (ev.key === '-' || ev.key === '_') scene.zoomBy(1 / 1.3);
    else if (ev.key === '0') scene.resetView();
    else if (ev.key === 'Escape') openPause();
    else return;
    ev.preventDefault();
  }

  /* ---------- 暫停 ---------- */
  function openPause() {
    if (hasModal() || session.done) return;
    session.pause();
    sfx('click');
    const close = (fn) => () => {
      pauseModal.close('action');
      fn?.();
    };
    pauseModal = openModal({
      title: t('pause.title'),
      cls: 'modal-menu',
      closeLabel: t('pause.resume'),
      body: h('div', { class: 'menu-col' },
        Button({ ico: 'play', label: t('pause.resume'), variant: 'primary', size: 'lg', onClick: close() }),
        Button({ ico: 'restart', label: t('pause.restart'), size: 'lg', onClick: close(restart) }),
        Button({ ico: 'list', label: t('result.back.' + params.mode), size: 'lg', onClick: close(() => ctx.back()) }),
        Button({ ico: 'home', label: t('result.home'), size: 'lg', onClick: close(() => ctx.home()) }),
      ),
      onClose: () => {
        pauseModal = null;
        if (!left) session.resume();
      },
    });
  }

  function onVisibility() {
    if (document.hidden && session.started && !session.done && !hasModal()) openPause();
  }

  /* ---------- 過關與結算 ---------- */
  function win() {
    const r = session.result();
    const today = taipeiDateKey();
    const prevBest = params.mode === 'campaign' ? store().progress.camp[params.diff].best[params.index] : null;
    const out = recordResult(store().progress, r, today);
    save();
    scene.celebrate(session.flow.dist);
    scene.setCursor(-1);
    sfx('win');
    vibrate([20, 60, 40]);
    window.GameAnalytics?.end({ result: 'complete' });
    winTimer = setTimeout(() => !left && showResult(r, out, prevBest), store().settings.reduceMotion ? 250 : 1100);
  }

  function showResult(r, out) {
    const go = (fn) => () => {
      resultModal?.close('action');
      fn();
    };
    const hasNext = params.mode === 'campaign' && params.index < LEVELS_PER_DIFF - 1;
    const actions = [];
    if (params.mode === 'campaign') {
      if (hasNext) actions.push(Button({ ico: 'next', label: t('result.next'), variant: 'primary', size: 'lg', onClick: go(() => ctx.go('game', { ...params, index: params.index + 1 }, { replace: true })) }));
      actions.push(Button({ ico: 'restart', label: t('result.again'), variant: hasNext ? 'soft' : 'primary', size: 'lg', onClick: go(restart) }));
    } else if (params.mode === 'random') {
      actions.push(Button({ ico: 'dice', label: t('result.newGame'), variant: 'primary', size: 'lg', onClick: go(() => ctx.go('game', { ...params, seed: newRandomSeed() }, { replace: true })) }));
    } else {
      actions.push(Button({ ico: 'restart', label: t('result.again'), variant: 'primary', size: 'lg', onClick: go(restart) }));
    }
    actions.push(Button({ ico: 'list', label: t('result.back.' + params.mode), size: 'lg', onClick: go(() => ctx.back()) }));
    actions.push(Button({ ico: 'home', label: t('result.home'), size: 'lg', onClick: go(() => ctx.home()) }));

    const stat = (ico, name, value, note) => h('div', { class: 'res-stat' }, icon(ico), h('span', { class: 'res-name' }, name), h('b', null, value), note && h('span', { class: 'res-note' }, note));
    // data-result-share：共用的 result-share.js 會在這張結算卡底部加上「分享結果」，把它做成分享圖片
    const body = h('div', { class: 'res', 'data-result-share': '' },
      h('h2', { class: 'res-headline', id: 'res-headline' }, t(params.diff === 'tot' ? 'result.titleTot' : 'result.title')),
      Stars(r.stars, { size: 'stars-xl' }),
      h('p', { class: 'res-level' }, title()),
      h('div', { class: 'res-stats' },
        stat('moves', t('game.moves'), String(r.moves), params.diff === 'tot' ? null : t('result.par', { n: r.par })),
        stat('clock', t('game.time'), fmtTime(r.seconds), params.diff === 'tot' ? null : t('result.target', { t: fmtTime(r.timeLimit) })),
        stat('hint', t('result.hints'), String(r.hints)),
      ),
      out.newBest && h('p', { class: 'res-best' }, icon('trophy'), t('result.newBest')),
      params.diff !== 'tot' && r.stars < 3 && h('p', { class: 'res-tip' }, t(r.hints > 0 ? 'result.tipHint' : r.stars === 2 && r.moves <= Math.ceil(r.par * 1.2) ? 'result.tipTime' : 'result.tipMoves')),
      out.newAchievements.length > 0 && h('div', { class: 'res-ach' },
        h('p', { class: 'res-ach-title' }, t('result.newAch')),
        out.newAchievements.map((id) => h('div', { class: 'res-ach-item' }, icon('trophy'), h('span', null, t('ach.' + id)))),
      ),
    );
    if (out.newAchievements.length) setTimeout(() => sfx('achievement'), 500);
    else setTimeout(() => sfx('star'), 300);
    resultModal = openModal({
      title: t(params.diff === 'tot' ? 'result.titleTot' : 'result.title'),
      cls: 'modal-result',
      labelledBy: 'res-headline',
      closable: false,
      body,
      actions,
      onClose: () => (resultModal = null),
    });
  }

  /* ---------- 啟動 ---------- */
  const tick = setInterval(() => {
    if (session && !session.done) chipTime.value.textContent = fmtTime(session.seconds());
  }, 250);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el,
    title,
    pause: openPause,
    mounted() {
      scene = new PipeScene(stageHost, {
        onTap: doTap,
        onHover: (i) => {
          if (!hasModal() && session && !session.done) setCursor(i);
        },
      });
      scene.setReducedMotion(store().settings.reduceMotion);
      begin();
      scene.start();
      if (window.__PIPE_TEST__) window.__game = { get session() { return session; }, scene, doTap, doHint, doUndo };
    },
    onLang: refreshTexts,
    onSettings() {
      scene.setReducedMotion(store().settings.reduceMotion);
    },
    leave() {
      left = true;
      clearInterval(tick);
      clearTimeout(winTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      if (session && session.started && !session.done) window.GameAnalytics?.end({ result: 'dnf' });
      else window.GameAnalytics?.reset();
      scene?.dispose();
      delete window.__game;
    },
  };
}
