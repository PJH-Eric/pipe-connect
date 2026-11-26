/* ===== verify.js — 規則核心測試（node tests/verify.js）===== */
import assert from 'node:assert/strict';
import { makeRng, hashSeed } from '../public/js/core/rng.js';
import {
  N, E, S, W, rotMask, period, kind, flow, rotate, unrotate, canRotate, neighbor,
  remainingTaps, hintCandidates, applyHint, cloneBoard, isAligned, curMask,
} from '../public/js/core/rules.js';
import { generate } from '../public/js/core/generator.js';
import {
  DIFFS, LEVELS_PER_DIFF, levelSpec, campaignBoard, randomBoard, dailyBoard,
  taipeiDateKey, shiftDateKey, rateStars, starTimeLimit, HINTS,
} from '../public/js/core/levels.js';

import { Session } from '../public/js/core/session.js';
import {
  emptyProgress, normalizeProgress, recordResult, unlockedCount, isUnlocked, dailyStreak, dailyDoneCount, starTotal,
} from '../public/js/core/progress.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error('✗ ' + name);
    throw e;
  }
}
const solvedCopy = (b) => {
  const c = cloneBoard(b);
  c.cells.forEach((x) => (x.rot = 0));
  return c;
};
const cell = (mask, extra = {}) => ({ mask, rot: 0, locked: false, src: 0, ...extra });

await test('亂數：同種子同結果、不同種子不同結果', () => {
  const a = makeRng('x'), b = makeRng('x'), c = makeRng('y');
  const sa = [a.next(), a.next(), a.next()], sb = [b.next(), b.next(), b.next()];
  assert.deepEqual(sa, sb);
  assert.notEqual(sa[0], c.next());
  assert.equal(hashSeed('abc'), hashSeed('abc'));
});

await test('旋轉：順時針 N→E→S→W', () => {
  assert.equal(rotMask(N, 1), E);
  assert.equal(rotMask(N, 2), S);
  assert.equal(rotMask(N, 3), W);
  assert.equal(rotMask(W, 1), N);
  assert.equal(rotMask(N | E, 1), E | S);
  assert.equal(rotMask(15, 3), 15);
  for (let m = 1; m < 16; m++) assert.equal(rotMask(m, 4), m);
});

await test('週期與種類', () => {
  assert.equal(period(15), 1);
  assert.equal(period(N | S), 2);
  assert.equal(period(E | W), 2);
  assert.equal(period(N | E), 4);
  assert.equal(period(N), 4);
  assert.equal(kind(N), 'end');
  assert.equal(kind(N | S), 'straight');
  assert.equal(kind(N | E), 'elbow');
  assert.equal(kind(N | E | S), 'tee');
  assert.equal(kind(15), 'cross');
});

await test('鄰格：一般盤面出界為 -1、環繞盤面會接到對面', () => {
  const b = { w: 3, h: 2, wrap: false, cells: new Array(6) };
  assert.equal(neighbor(b, 0, 0), -1);
  assert.equal(neighbor(b, 0, 3), -1);
  assert.equal(neighbor(b, 0, 1), 1);
  assert.equal(neighbor(b, 0, 2), 3);
  b.wrap = true;
  assert.equal(neighbor(b, 0, 3), 2);
  assert.equal(neighbor(b, 0, 0), 3);
  assert.equal(neighbor(b, 5, 1), 3);
});

await test('水流：兩格直線接通即過關，轉開就漏水', () => {
  const b = { w: 2, h: 1, wrap: false, cells: [cell(E, { src: 1 }), cell(W)] };
  let f = flow(b);
  assert.equal(f.solved, true);
  assert.deepEqual([...f.color], [1, 1]);
  assert.deepEqual([...f.dist], [0, 1]);
  rotate(b, 1);
  f = flow(b);
  assert.equal(f.solved, false);
  assert.equal(f.leaks.length, 2);
  assert.deepEqual([...f.color], [1, 0]);
});

await test('水流：沒有漏水但有一段沒接到水源，不算過關', () => {
  // 上排水源→端點，下排兩個端點互接但沒有水
  const b = { w: 2, h: 2, wrap: false, cells: [cell(E, { src: 1 }), cell(W), cell(E), cell(W)] };
  const f = flow(b);
  assert.equal(f.leaks.length, 0);
  assert.equal(f.solved, false);
  assert.equal(f.wet, 2);
});

await test('水流：不同顏色混在一起不算過關', () => {
  const b = { w: 3, h: 1, wrap: false, cells: [cell(E, { src: 1 }), cell(E | W), cell(W, { src: 2 })] };
  const f = flow(b);
  assert.equal(f.leaks.length, 0);
  assert.equal(f.mixed, true);
  assert.equal(f.solved, false);
  assert.deepEqual([...f.color], [-1, -1, -1]);
});

await test('水流：環繞盤面的水管可以穿過邊界', () => {
  const b = { w: 3, h: 1, wrap: true, cells: [cell(W, { src: 1 }), cell(E), cell(E | W)] };
  // 0 往西接到 2，2 往西接到 1（1 開口朝東）…排成 1→2→0 的環繞直線
  const f = flow(b);
  assert.equal(f.solved, true);
  b.wrap = false;
  assert.equal(flow(b).solved, false);
});

await test('操作：鎖住與十字不能轉、復原會轉回去', () => {
  const b = { w: 2, h: 1, wrap: false, cells: [cell(E, { src: 1, locked: true }), cell(15)] };
  assert.equal(canRotate(b, 0), false);
  assert.equal(canRotate(b, 1), false);
  assert.equal(rotate(b, 0), false);
  assert.equal(canRotate(b, 9), false);
  const c = { w: 1, h: 1, wrap: false, cells: [cell(N)] };
  rotate(c, 0);
  rotate(c, 0);
  assert.equal(curMask(c.cells[0]), S);
  unrotate(c, 0);
  assert.equal(curMask(c.cells[0]), E);
});

await test('提示：把水管轉正並鎖住，剩餘步數會減少', () => {
  const b = generate({ w: 5, h: 5, colors: 1, wrap: false, lockRatio: 0 }, 'hint');
  const before = remainingTaps(b);
  const list = hintCandidates(b);
  assert.ok(list.length > 0);
  assert.equal(applyHint(b, list[0]), true);
  assert.ok(remainingTaps(b) < before);
  assert.equal(b.cells[list[0]].locked, true);
  assert.equal(isAligned(b.cells[list[0]]), true);
  assert.equal(applyHint(b, list[0]), false);
  assert.ok(!hintCandidates(b).includes(list[0]));
});

await test('產生器：同種子完全相同', () => {
  const spec = { w: 8, h: 8, colors: 2, wrap: true, lockRatio: 0.1 };
  assert.deepEqual(generate(spec, 's1'), generate(spec, 's1'));
  assert.notDeepEqual(generate(spec, 's1'), generate(spec, 's2'));
});

await test('闖關 1500 關：全部有解、開局未過關、水源數正確、照點標準步數必過關', () => {
  for (const diff of DIFFS) {
    for (let i = 0; i < LEVELS_PER_DIFF; i++) {
      const b = campaignBoard(diff, i);
      const spec = levelSpec(diff, i);
      const tag = `${diff}#${i + 1}`;
      assert.equal(b.cells.length, spec.w * spec.h, tag);
      assert.ok(b.cells.every((c) => c.mask > 0 && c.mask < 16), tag + ' 每格都要有水管');
      assert.equal(b.cells.filter((c) => c.src).length, spec.colors, tag + ' 水源數');
      assert.equal(new Set(b.cells.filter((c) => c.src).map((c) => c.src)).size, spec.colors, tag);
      assert.equal(flow(b).solved, false, tag + ' 開局不可已過關');
      assert.equal(flow(solvedCopy(b)).solved, true, tag + ' 解答必須過關');
      assert.ok(b.cells.every((c) => !c.locked || c.rot === 0), tag + ' 鎖住的水管必須在解答方向');
      assert.ok(b.par >= 3, tag + ' 標準步數太少');
      // 模擬玩家：每格照剩餘次數點下去
      const play = cloneBoard(b);
      let taps = 0;
      play.cells.forEach((c, k) => {
        while (!isAligned(c)) {
          assert.equal(rotate(play, k), true, tag);
          taps++;
        }
      });
      assert.equal(taps, b.par, tag);
      assert.equal(flow(play).solved, true, tag);
    }
  }
});

await test('產生器：多色盤面各顏色的範圍不會差太多', () => {
  let worst = 1, sum = 0, count = 0;
  for (const diff of ['normal', 'hard', 'myth']) {
    for (let i = 0; i < LEVELS_PER_DIFF; i++) {
      const b = solvedCopy(campaignBoard(diff, i));
      if (b.colors < 2) continue;
      const f = flow(b);
      const per = new Array(b.colors + 1).fill(0);
      f.color.forEach((c) => per[c]++);
      const share = Math.min(...per.slice(1)) / (b.cells.length / b.colors);
      worst = Math.min(worst, share);
      sum += share;
      count++;
    }
  }
  assert.ok(sum / count > 0.6, '平均最小佔比太低：' + (sum / count).toFixed(2));
  assert.ok(worst > 0.12, '有顏色幾乎沒有範圍：' + worst.toFixed(2));
});

await test('難度規格：盤面由小到大、進階機關只在較高難度', () => {
  assert.equal(levelSpec('tot', 0).w, 3);
  assert.equal(levelSpec('tot', 99).colors, 1);
  assert.equal(levelSpec('easy', 99).wrap, false);
  assert.equal(levelSpec('normal', 99).colors, 2);
  assert.equal(levelSpec('hard', 99).wrap, true);
  assert.equal(levelSpec('myth', 0).wrap, true);
  assert.equal(levelSpec('myth', 99).colors, 4);
  assert.equal(levelSpec('myth', 99).w, 12);
  assert.throws(() => levelSpec('x', 0));
  assert.equal(HINTS.tot, Infinity);
  assert.equal(HINTS.myth, 1);
});

await test('每日挑戰：同日同題、隔日換題、五難度各一題', () => {
  for (const diff of DIFFS) {
    assert.deepEqual(dailyBoard(diff, '2026-11-13'), dailyBoard(diff, '2026-11-13'));
    assert.notDeepEqual(dailyBoard(diff, '2026-11-13'), dailyBoard(diff, '2026-11-14'));
    assert.equal(flow(solvedCopy(dailyBoard(diff, '2026-11-13'))).solved, true);
  }
  assert.notDeepEqual(dailyBoard('easy', '2026-11-13').cells, dailyBoard('normal', '2026-11-13').cells);
});

await test('每日挑戰：以台北時間午夜換日', () => {
  assert.equal(taipeiDateKey(Date.UTC(2026, 10, 13, 15, 59, 59)), '2026-11-13');
  assert.equal(taipeiDateKey(Date.UTC(2026, 10, 13, 16, 0, 0)), '2026-11-14');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
});

await test('隨機模式：有解且不同種子不同題', () => {
  for (const diff of DIFFS) {
    for (let k = 0; k < 40; k++) {
      const b = randomBoard(diff, 'r' + k);
      assert.equal(flow(b).solved, false);
      assert.equal(flow(solvedCopy(b)).solved, true);
    }
  }
  assert.notDeepEqual(randomBoard('easy', 'a'), randomBoard('easy', 'b'));
});

await test('評星：步數、時間與提示', () => {
  const base = { diff: 'easy', par: 10, timeLimit: 100 };
  assert.equal(rateStars({ ...base, moves: 12, seconds: 50, hints: 0 }), 3);
  assert.equal(rateStars({ ...base, moves: 12, seconds: 101, hints: 0 }), 2);
  assert.equal(rateStars({ ...base, moves: 12, seconds: 50, hints: 1 }), 2);
  assert.equal(rateStars({ ...base, moves: 16, seconds: 500, hints: 3 }), 2);
  assert.equal(rateStars({ ...base, moves: 17, seconds: 10, hints: 0 }), 1);
  assert.equal(rateStars({ diff: 'tot', par: 5, moves: 99, seconds: 999, hints: 9, timeLimit: 1 }), 3);
  assert.equal(starTimeLimit({ w: 5, h: 5 }), 100);
});

/* ---------- 一局遊戲 ---------- */
const playOut = (ses, t0 = 1000) => {
  let t = t0;
  ses.board.cells.forEach((c, k) => {
    while (!c.locked && !isAligned(c)) ses.tap(k, (t += 1000));
  });
  return t;
};

await test('對局：照標準步數玩完會過關，步數與時間正確', () => {
  const ses = new Session(campaignBoard('easy', 0), { mode: 'campaign', diff: 'easy', index: 0 });
  assert.equal(ses.seconds(5000), 0, '還沒動之前不計時');
  playOut(ses);
  assert.equal(ses.done, true);
  assert.equal(ses.moves, ses.par);
  const r = ses.result();
  assert.equal(r.stars, 3);
  assert.equal(r.seconds, ses.par - 1);
  assert.equal(ses.tap(0).ok, false, '過關後不能再轉');
  assert.equal(ses.undo(), -1);
});

await test('對局：鎖住的水管點了無效且不算步數', () => {
  const b = campaignBoard('tot', 30);
  const ses = new Session(b, { mode: 'campaign', diff: 'tot', index: 30 });
  const k = b.cells.findIndex((c) => c.locked);
  assert.ok(k >= 0);
  assert.deepEqual(ses.tap(k), { ok: false, reason: 'locked' });
  assert.equal(ses.moves, 0);
  assert.equal(ses.started, false);
});

await test('對局：復原會轉回去但步數不退', () => {
  const b = campaignBoard('easy', 3);
  const ses = new Session(b, { mode: 'campaign', diff: 'easy', index: 3 });
  const k = b.cells.findIndex((c) => !c.locked && period(c.mask) === 4);
  const before = b.cells[k].rot;
  ses.tap(k, 1);
  assert.equal(ses.undo(), k);
  assert.equal(b.cells[k].rot, before);
  assert.equal(ses.moves, 1);
  assert.equal(ses.canUndo, false);
});

await test('對局：提示次數依難度、用完就不能再用、被提示的格子不會被復原', () => {
  const b = campaignBoard('myth', 0);
  const ses = new Session(b, { mode: 'campaign', diff: 'myth', index: 0 });
  const target = ses._hintTarget();
  ses.tap(target, 1);
  const h = ses.hint(2);
  assert.ok(h.i >= 0);
  assert.equal(ses.hintsLeft, 0);
  assert.equal(ses.canHint, false);
  assert.equal(ses.hint(), -1);
  assert.ok(!ses.undoStack.includes(h.i));
  assert.equal(b.cells[h.i].locked, true);
  playOut(ses);
  assert.equal(ses.done, true);
  assert.ok(ses.result().stars < 3, '用過提示拿不到三星');
});

await test('對局：幼幼班提示不限次數，一路提示到過關且一律三星', () => {
  const ses = new Session(campaignBoard('tot', 5), { mode: 'campaign', diff: 'tot', index: 5 });
  let guard = 0;
  while (!ses.done && guard++ < 100) assert.notEqual(ses.hint(guard), -1);
  assert.equal(ses.done, true);
  assert.equal(ses.result().stars, 3);
});

await test('對局：開局倒數結束呼叫 start() 才開始計時，之後第一次轉動不會重設起點', () => {
  const ses = new Session(campaignBoard('easy', 2), { mode: 'campaign', diff: 'easy', index: 2 });
  assert.equal(ses.started, false);
  ses.start(1000);
  assert.equal(ses.started, true);
  assert.equal(ses.seconds(4000), 3);
  const k = ses.board.cells.findIndex((c) => !c.locked && period(c.mask) > 1);
  ses.tap(k, 5000);
  assert.equal(ses.seconds(6000), 5);
  ses.start(9000);
  assert.equal(ses.seconds(9000), 8, '重複 start 沒有作用');
});

await test('對局：存檔再接回來，盤面、步數、時間、提示與復原都一致', () => {
  const info = { mode: 'campaign', diff: 'normal', index: 3 };
  const a = new Session(campaignBoard('normal', 3), info);
  a.start(0);
  const free = a.board.cells.map((c, i) => i).filter((i) => !a.board.cells[i].locked && period(a.board.cells[i].mask) === 4);
  a.tap(free[0], 1000);
  a.tap(free[1], 2000);
  const h = a.hint(3000);
  a.tap(free[2] === h.i ? free[3] : free[2], 4000);
  const snap = JSON.parse(JSON.stringify(a.snapshot(5000)));
  const b = new Session(campaignBoard('normal', 3), info);
  assert.equal(b.restore(snap), true);
  assert.deepEqual(b.board.cells, a.board.cells);
  assert.equal(b.moves, 3);
  assert.equal(b.hintsUsed, 1);
  assert.equal(b.hintsLeft, HINTS.normal - 1);
  assert.equal(b.paused, true, '接回來先暫停，倒數完才繼續計時');
  assert.equal(b.seconds(99999), 5);
  b.resume(10000);
  assert.equal(b.seconds(12000), 7);
  assert.deepEqual(b.undoStack, a.undoStack);
  assert.ok(!b.undoStack.includes(h.i));
  assert.deepEqual([...b.flow.color], [...a.flow.color]);
  playOut(b, 20000);
  assert.equal(b.done, true);
  assert.ok(b.result().stars < 3, '用過提示的紀錄有跟著接回來');
});

await test('對局：壞掉或不合的存檔一律拒絕，盤面不受影響', () => {
  const info = { mode: 'campaign', diff: 'easy', index: 0 };
  const fresh = () => new Session(campaignBoard('easy', 0), info);
  const good = (() => {
    const s = fresh();
    s.start(0);
    s.tap(s.board.cells.findIndex((c) => !c.locked && period(c.mask) === 4), 10);
    return s.snapshot(20);
  })();
  const bad = [
    null, {}, { ...good, v: 2 }, { ...good, n: 3 }, { ...good, rots: good.rots.slice(1) },
    { ...good, rots: good.rots.map(() => 7) }, { ...good, moves: -1 }, { ...good, moves: 1.5 },
    { ...good, hintsUsed: 99 }, { ...good, hinted: [9999] }, { ...good, undo: 'x' }, { ...good, elapsedMs: NaN },
    { ...good, rots: good.rots.map(() => 0) }, // 直接改成解答：不能靠改存檔過關
  ];
  const lockedAt = campaignBoard('easy', 0).cells.findIndex((c) => c.locked);
  if (lockedAt >= 0) bad.push({ ...good, rots: good.rots.map((r, i) => (i === lockedAt ? 1 : r)) });
  for (const snap of bad) {
    const s = fresh();
    const before = JSON.stringify(s.board);
    assert.equal(s.restore(snap), false, JSON.stringify(snap)?.slice(0, 60));
    assert.equal(JSON.stringify(s.board), before);
    assert.equal(s.started, false);
  }
  assert.equal(fresh().restore(good), true);
});

await test('對局：暫停期間不計時', () => {
  const ses = new Session(campaignBoard('easy', 1), { mode: 'campaign', diff: 'easy', index: 1 });
  const k = ses.board.cells.findIndex((c) => !c.locked && period(c.mask) > 1);
  ses.tap(k, 1000);
  ses.pause(3000);
  assert.equal(ses.paused, true);
  assert.equal(ses.seconds(9000), 2);
  ses.resume(9000);
  assert.equal(ses.seconds(10000), 3);
});

/* ---------- 進度與成就 ---------- */
const res = (o) => ({ mode: 'campaign', diff: 'easy', index: 0, moves: 10, par: 10, seconds: 20, timeLimit: 100, hints: 0, stars: 3, ...o });

await test('進度：闖關依序解鎖、星數只會變多、最佳成績會更新', () => {
  const p = emptyProgress();
  assert.equal(unlockedCount(p, 'easy'), 1);
  assert.equal(isUnlocked(p, 'easy', 1), false);
  let out = recordResult(p, res({ stars: 2, moves: 14 }), '2026-11-13');
  assert.equal(out.firstClear, true);
  assert.equal(out.newBest, false);
  assert.ok(out.newAchievements.includes('first'));
  assert.equal(isUnlocked(p, 'easy', 1), true);
  assert.equal(isUnlocked(p, 'easy', 2), false);
  out = recordResult(p, res({ stars: 1, moves: 30 }), '2026-11-13');
  assert.equal(p.camp.easy.stars[0], 2);
  assert.equal(out.newBest, false);
  out = recordResult(p, res({ stars: 3, moves: 10 }), '2026-11-13');
  assert.equal(out.newBest, true);
  assert.equal(starTotal(p, 'easy'), 3);
  assert.equal(p.stats.clears, 3);
  assert.equal(isUnlocked(p, 'hard', 0), true);
});

await test('進度：每日挑戰連續天數與一天五題成就', () => {
  const p = emptyProgress();
  const day = (k, diff = 'easy') => recordResult(p, res({ mode: 'daily', dateKey: k, diff }), k);
  day('2026-11-10');
  day('2026-11-11');
  assert.equal(dailyStreak(p, '2026-11-12'), 2, '今天還沒玩，昨天的連續不中斷');
  let out = day('2026-11-12');
  assert.ok(out.newAchievements.includes('streak3'));
  assert.equal(dailyStreak(p, '2026-11-14'), 0, '隔一天沒玩就歸零');
  for (const d of DIFFS) out = day('2026-11-20', d);
  assert.equal(dailyDoneCount(p, '2026-11-20'), 5);
  assert.ok(out.newAchievements.includes('daily5'));
  assert.equal(p.stats.maxStreak, 3);
});

await test('進度：壞掉的存檔會被修成可用的資料', () => {
  const p = normalizeProgress({ camp: { easy: { stars: [3, 9, -1, 'x'] }, hard: 5 }, daily: { bad: 1, '2026-11-13': { easy: { m: 1, s: 1, st: 3 } } }, stats: { clears: 'a', taps: 7 }, ach: null });
  assert.deepEqual(p.camp.easy.stars, [3, 3, 0, 0]);
  assert.deepEqual(p.camp.hard.stars, []);
  assert.deepEqual(Object.keys(p.daily), ['2026-11-13']);
  assert.equal(p.stats.clears, 0);
  assert.equal(p.stats.taps, 7);
  assert.deepEqual(normalizeProgress(null), emptyProgress());
});

await test('進度：隨機模式只記次數與最快時間，不影響闖關', () => {
  const p = emptyProgress();
  recordResult(p, res({ mode: 'random', diff: 'hard', seconds: 50 }), '2026-11-13');
  const out = recordResult(p, res({ mode: 'random', diff: 'hard', seconds: 40 }), '2026-11-13');
  assert.equal(out.newBest, true);
  assert.equal(p.stats.random.hard, 2);
  assert.equal(p.stats.randomBest.hard.s, 40);
  assert.equal(unlockedCount(p, 'hard'), 1);
});

/* ---------- 語系 ---------- */
await test('語系：三個語言的 key 完全一致、沒有空字串、參數名稱相同', async () => {
  const { LOCALES } = await import('../public/js/locales.js');
  const base = Object.keys(LOCALES['zh-Hant']).sort();
  for (const lang of ['zh-Hans', 'en']) {
    assert.deepEqual(Object.keys(LOCALES[lang]).sort(), base, lang + ' 的 key 與繁中不一致');
    for (const k of base) {
      assert.ok(LOCALES[lang][k].trim().length > 0, `${lang} ${k} 是空的`);
      const params = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(params(LOCALES[lang][k]), params(LOCALES['zh-Hant'][k]), `${lang} ${k} 的參數不同`);
    }
  }
  // 程式裡用到的 key 都要存在
  const fs = await import('node:fs');
  const used = new Set();
  for (const f of ['app.js', 'ui/game.js', 'ui/screens.js', 'i18n.js']) {
    const src = fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9.]+)'/g)) used.add(m[1]);
  }
  for (const k of used) {
    if (k.endsWith('.')) assert.ok(base.some((b) => b.startsWith(k)), '找不到以 ' + k + ' 開頭的文字');
    else assert.ok(base.includes(k), '缺少文字：' + k);
  }
});

console.log(`規則測試全部通過：${passed} 項`);
