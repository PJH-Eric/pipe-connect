/* ===== generator.js — 用種子產生一定有解的盤面 =====
 * 做法：先放水源，再讓每個水源各自長出一棵「水管樹」填滿整個盤面，
 * 樹的形狀就是解答；最後把沒鎖住的水管隨機轉亂。
 */
import { makeRng } from './rng.js';
import { DIRS, neighbor, period, flow, remainingTaps } from './rules.js';

/**
 * @param spec { w, h, colors, wrap, lockRatio }
 * @param seed 種子（字串或整數）
 */
export function generate(spec, seed) {
  const rng = makeRng(seed);
  const { w, h } = spec;
  const colors = Math.max(1, Math.min(spec.colors || 1, 4));
  const n = w * h;
  const board = { w, h, wrap: !!spec.wrap, colors, cells: [] };
  for (let i = 0; i < n; i++) board.cells.push({ mask: 0, rot: 0, locked: false, src: 0 });

  // 1. 放水源：盡量互相離遠一點
  const owner = new Int8Array(n);
  const sources = [];
  for (let c = 1; c <= colors; c++) {
    let best = -1;
    let bestScore = -1;
    for (let t = 0; t < 12; t++) {
      const i = rng.int(n);
      if (owner[i]) continue;
      let score = 99;
      for (const s of sources) score = Math.min(score, gridDist(board, i, s));
      score += rng.next();
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) best = owner.indexOf(0);
    owner[best] = c;
    board.cells[best].src = c;
    sources.push(best);
  }

  // 2. 長出水管樹。每個顏色各有一份 frontier，存「已在樹上的格子 → 還沒被佔的鄰格」
  const frontiers = [];
  const size = new Int32Array(colors + 1).fill(1);
  for (let c = 0; c <= colors; c++) frontiers.push([]);
  const pushEdges = (i) => {
    for (let d = 0; d < 4; d++) {
      const j = neighbor(board, i, d);
      if (j >= 0 && j !== i && !owner[j]) frontiers[owner[i]].push({ i, d, j });
    }
  };
  const degree = (i) => {
    const m = board.cells[i].mask;
    return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  };
  const take = (e) => {
    board.cells[e.i].mask |= DIRS[e.d].bit;
    board.cells[e.j].mask |= DIRS[e.d].opp;
    owner[e.j] = owner[e.i];
    size[owner[e.i]]++;
    pushEdges(e.j);
  };
  // 每個水源先各接出一節，避免被別的顏色包圍成孤島
  for (const s of sources) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const j = neighbor(board, s, d);
      if (j >= 0 && j !== s && !owner[j]) opts.push({ i: s, d, j });
    }
    if (!opts.length) return generate(spec, String(seed) + '~');
    take(rng.pick(opts));
  }
  sources.forEach(pushEdges);
  for (;;) {
    // 清掉已經被佔走的邊，再決定這一步讓哪個顏色長
    const alive = [];
    for (let c = 1; c <= colors; c++) {
      const f = frontiers[c];
      for (let k = f.length - 1; k >= 0; k--) if (owner[f[k].j]) f.splice(k, 1);
      if (f.length) alive.push(c);
    }
    if (!alive.length) break;
    // 多半讓目前最小的那棵樹長，各顏色的範圍才不會差太多
    let c = alive[0];
    if (rng.chance(0.8)) {
      for (const x of alive) if (size[x] < size[c]) c = x;
    } else c = rng.pick(alive);
    const f = frontiers[c];
    // 偏好最近加入的邊會長出蜿蜒的長管，偶爾隨機挑則長出分岔
    let k = rng.chance(0.55) ? f.length - 1 - rng.int(Math.min(3, f.length)) : rng.int(f.length);
    // 十字太多會讓題目變無聊，已經是三通的格子大多不再分岔
    if (degree(f[k].i) >= 3 && f.length > 1 && rng.chance(0.85)) {
      const alt = f.findIndex((e) => degree(e.i) < 3);
      if (alt >= 0) k = alt;
    }
    const e = f[k];
    f.splice(k, 1);
    take(e);
  }

  // 3. 鎖住一部分水管當線索（十字本來就不用轉，不算在內）
  const turnable = [];
  board.cells.forEach((c, i) => {
    if (period(c.mask) > 1) turnable.push(i);
  });
  rng.shuffle(turnable);
  const lockCount = Math.min(turnable.length - 2, Math.round(turnable.length * (spec.lockRatio || 0)));
  for (let k = 0; k < lockCount; k++) board.cells[turnable[k]].locked = true;

  // 4. 轉亂：大部分水管都要偏離解答，而且不能一開始就過關
  const free = turnable.slice(Math.max(0, lockCount));
  const scramble = () => {
    for (const i of free) {
      const c = board.cells[i];
      const p = period(c.mask);
      c.rot = rng.chance(0.82) ? 1 + rng.int(p - 1) : 0;
    }
  };
  scramble();
  for (let guard = 0; guard < 20 && (flow(board).solved || remainingTaps(board) < Math.min(3, free.length)); guard++) {
    scramble();
    if (guard > 10) board.cells[free[0]].rot = 1;
  }

  board.par = remainingTaps(board);
  return board;
}

function gridDist(board, a, b) {
  let dx = Math.abs((a % board.w) - (b % board.w));
  let dy = Math.abs(Math.floor(a / board.w) - Math.floor(b / board.w));
  if (board.wrap) {
    dx = Math.min(dx, board.w - dx);
    dy = Math.min(dy, board.h - dy);
  }
  return dx + dy;
}
