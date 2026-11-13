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

let passed = 0;
function test(name, fn) {
  try {
    fn();
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

test('亂數：同種子同結果、不同種子不同結果', () => {
  const a = makeRng('x'), b = makeRng('x'), c = makeRng('y');
  const sa = [a.next(), a.next(), a.next()], sb = [b.next(), b.next(), b.next()];
  assert.deepEqual(sa, sb);
  assert.notEqual(sa[0], c.next());
  assert.equal(hashSeed('abc'), hashSeed('abc'));
});

test('旋轉：順時針 N→E→S→W', () => {
  assert.equal(rotMask(N, 1), E);
  assert.equal(rotMask(N, 2), S);
  assert.equal(rotMask(N, 3), W);
  assert.equal(rotMask(W, 1), N);
  assert.equal(rotMask(N | E, 1), E | S);
  assert.equal(rotMask(15, 3), 15);
  for (let m = 1; m < 16; m++) assert.equal(rotMask(m, 4), m);
});

test('週期與種類', () => {
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

test('鄰格：一般盤面出界為 -1、環繞盤面會接到對面', () => {
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

test('水流：兩格直線接通即過關，轉開就漏水', () => {
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

test('水流：沒有漏水但有一段沒接到水源，不算過關', () => {
  // 上排水源→端點，下排兩個端點互接但沒有水
  const b = { w: 2, h: 2, wrap: false, cells: [cell(E, { src: 1 }), cell(W), cell(E), cell(W)] };
  const f = flow(b);
  assert.equal(f.leaks.length, 0);
  assert.equal(f.solved, false);
  assert.equal(f.wet, 2);
});

test('水流：不同顏色混在一起不算過關', () => {
  const b = { w: 3, h: 1, wrap: false, cells: [cell(E, { src: 1 }), cell(E | W), cell(W, { src: 2 })] };
  const f = flow(b);
  assert.equal(f.leaks.length, 0);
  assert.equal(f.mixed, true);
  assert.equal(f.solved, false);
  assert.deepEqual([...f.color], [-1, -1, -1]);
});

test('水流：環繞盤面的水管可以穿過邊界', () => {
  const b = { w: 3, h: 1, wrap: true, cells: [cell(W, { src: 1 }), cell(E), cell(E | W)] };
  // 0 往西接到 2，2 往西接到 1（1 開口朝東）…排成 1→2→0 的環繞直線
  const f = flow(b);
  assert.equal(f.solved, true);
  b.wrap = false;
  assert.equal(flow(b).solved, false);
});

test('操作：鎖住與十字不能轉、復原會轉回去', () => {
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

test('提示：把水管轉正並鎖住，剩餘步數會減少', () => {
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

test('產生器：同種子完全相同', () => {
  const spec = { w: 8, h: 8, colors: 2, wrap: true, lockRatio: 0.1 };
  assert.deepEqual(generate(spec, 's1'), generate(spec, 's1'));
  assert.notDeepEqual(generate(spec, 's1'), generate(spec, 's2'));
});

test('闖關 500 關：全部有解、開局未過關、水源數正確、照點標準步數必過關', () => {
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

test('難度規格：盤面由小到大、進階機關只在較高難度', () => {
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

test('每日挑戰：同日同題、隔日換題、五難度各一題', () => {
  for (const diff of DIFFS) {
    assert.deepEqual(dailyBoard(diff, '2026-11-13'), dailyBoard(diff, '2026-11-13'));
    assert.notDeepEqual(dailyBoard(diff, '2026-11-13'), dailyBoard(diff, '2026-11-14'));
    assert.equal(flow(solvedCopy(dailyBoard(diff, '2026-11-13'))).solved, true);
  }
  assert.notDeepEqual(dailyBoard('easy', '2026-11-13').cells, dailyBoard('normal', '2026-11-13').cells);
});

test('每日挑戰：以台北時間午夜換日', () => {
  assert.equal(taipeiDateKey(Date.UTC(2026, 10, 13, 15, 59, 59)), '2026-11-13');
  assert.equal(taipeiDateKey(Date.UTC(2026, 10, 13, 16, 0, 0)), '2026-11-14');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
});

test('隨機模式：有解且不同種子不同題', () => {
  for (const diff of DIFFS) {
    for (let k = 0; k < 40; k++) {
      const b = randomBoard(diff, 'r' + k);
      assert.equal(flow(b).solved, false);
      assert.equal(flow(solvedCopy(b)).solved, true);
    }
  }
  assert.notDeepEqual(randomBoard('easy', 'a'), randomBoard('easy', 'b'));
});

test('評星：步數、時間與提示', () => {
  const base = { diff: 'easy', par: 10, timeLimit: 100 };
  assert.equal(rateStars({ ...base, moves: 12, seconds: 50, hints: 0 }), 3);
  assert.equal(rateStars({ ...base, moves: 12, seconds: 101, hints: 0 }), 2);
  assert.equal(rateStars({ ...base, moves: 12, seconds: 50, hints: 1 }), 2);
  assert.equal(rateStars({ ...base, moves: 16, seconds: 500, hints: 3 }), 2);
  assert.equal(rateStars({ ...base, moves: 17, seconds: 10, hints: 0 }), 1);
  assert.equal(rateStars({ diff: 'tot', par: 5, moves: 99, seconds: 999, hints: 9, timeLimit: 1 }), 3);
  assert.equal(starTimeLimit({ w: 5, h: 5 }), 100);
});

console.log(`規則測試全部通過：${passed} 項`);
