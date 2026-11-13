/* ===== rules.js — 水管接通的規則核心（不碰畫面、音效、儲存）=====
 *
 * 盤面：w×h 個格子，每格一節水管。
 *   mask   解答方向的開口（N=1、E=2、S=4、W=8 的位元組合）
 *   rot    目前相對解答順時針多轉了幾次（0～3）
 *   locked 鎖住不能轉（生鏽的水管，或用提示固定的水管）
 *   src    水源顏色（0＝不是水源，1 以上＝水源顏色編號）
 * wrap＝true 時盤面左右、上下邊緣相通。
 *
 * 過關：每個開口都接到鄰格的開口（沒有漏水）、每節水管都有水、
 *       而且不同顏色的水沒有混在一起。
 */

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [
  { bit: N, opp: S, dx: 0, dy: -1 },
  { bit: E, opp: W, dx: 1, dy: 0 },
  { bit: S, opp: N, dx: 0, dy: 1 },
  { bit: W, opp: E, dx: -1, dy: 0 },
];

/** 開口順時針轉 r 次（N→E→S→W） */
export function rotMask(mask, r) {
  r &= 3;
  return ((mask << r) | (mask >> (4 - r))) & 15;
}

/** 轉幾次會回到原樣：十字 1、直管 2、其餘 4 */
export function period(mask) {
  if (mask === 15) return 1;
  if (mask === 5 || mask === 10) return 2;
  return 4;
}

/** 水管種類：end 端點、straight 直管、elbow 彎管、tee 三通、cross 十字 */
export function kind(mask) {
  const n = bitCount(mask);
  if (n === 1) return 'end';
  if (n === 3) return 'tee';
  if (n === 4) return 'cross';
  return mask === 5 || mask === 10 ? 'straight' : 'elbow';
}

export function bitCount(m) {
  return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
}

/** 目前實際的開口 */
export function curMask(cell) {
  return rotMask(cell.mask, cell.rot);
}

/** 這節水管目前是否在解答方向 */
export function isAligned(cell) {
  return cell.rot % period(cell.mask) === 0;
}

/** 第 i 格往方向 d 的鄰格索引；出界回傳 -1 */
export function neighbor(board, i, d) {
  const { w, h, wrap } = board;
  let x = (i % w) + DIRS[d].dx;
  let y = Math.floor(i / w) + DIRS[d].dy;
  if (wrap) {
    x = (x + w) % w;
    y = (y + h) % h;
  } else if (x < 0 || y < 0 || x >= w || y >= h) {
    return -1;
  }
  return y * w + x;
}

/**
 * 計算水流。
 * 回傳 color[i]：0＝沒水、正數＝該顏色的水、-1＝混到不同顏色的水；
 *      dist[i]：離最近水源幾格（給水流動畫用，沒水為 -1）；
 *      leaks：沒接上的開口 [{ i, d }]；solved：是否過關。
 */
export function flow(board) {
  const n = board.cells.length;
  const masks = board.cells.map(curMask);
  const comp = new Int32Array(n).fill(-1);
  const color = new Int8Array(n);
  const dist = new Int16Array(n).fill(-1);
  const leaks = [];
  const compColor = [];

  const linked = (i, d) => {
    if (!(masks[i] & DIRS[d].bit)) return -1;
    const j = neighbor(board, i, d);
    return j >= 0 && masks[j] & DIRS[d].opp ? j : -1;
  };

  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 4; d++) {
      if (masks[i] & DIRS[d].bit && linked(i, d) < 0) leaks.push({ i, d });
    }
    if (comp[i] >= 0) continue;
    const id = compColor.length;
    let c = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const a = stack.pop();
      const s = board.cells[a].src;
      if (s) c = c === 0 || c === s ? s : -1;
      for (let d = 0; d < 4; d++) {
        const b = linked(a, d);
        if (b >= 0 && comp[b] < 0) {
          comp[b] = id;
          stack.push(b);
        }
      }
    }
    compColor.push(c);
  }

  // 從所有水源同時往外擴散，算出每格離水源的距離
  let queue = [];
  for (let i = 0; i < n; i++) {
    color[i] = compColor[comp[i]];
    if (board.cells[i].src) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  while (queue.length) {
    const next = [];
    for (const a of queue) {
      for (let d = 0; d < 4; d++) {
        const b = linked(a, d);
        if (b >= 0 && dist[b] < 0) {
          dist[b] = dist[a] + 1;
          next.push(b);
        }
      }
    }
    queue = next;
  }

  let wet = 0;
  let mixed = false;
  for (let i = 0; i < n; i++) {
    if (color[i] > 0) wet++;
    else if (color[i] < 0) mixed = true;
  }
  const solved = leaks.length === 0 && wet === n && !mixed;
  return { color, dist, leaks, wet, mixed, solved };
}

/** 這格現在能不能轉 */
export function canRotate(board, i) {
  const c = board.cells[i];
  return !!c && !c.locked && period(c.mask) > 1;
}

/** 順時針轉一次；不能轉回傳 false */
export function rotate(board, i) {
  if (!canRotate(board, i)) return false;
  const c = board.cells[i];
  c.rot = (c.rot + 1) & 3;
  return true;
}

/** 復原用：逆時針轉回一次 */
export function unrotate(board, i) {
  const c = board.cells[i];
  if (!c || c.locked) return false;
  c.rot = (c.rot + 3) & 3;
  return true;
}

/** 從目前狀態轉到解答最少還要點幾下 */
export function remainingTaps(board) {
  let t = 0;
  for (const c of board.cells) {
    const p = period(c.mask);
    t += (p - (c.rot % p)) % p;
  }
  return t;
}

/** 可以拿來提示的格子（還沒轉對、也沒鎖住） */
export function hintCandidates(board) {
  const out = [];
  board.cells.forEach((c, i) => {
    if (!c.locked && !isAligned(c)) out.push(i);
  });
  return out;
}

/** 套用提示：把第 i 格轉到解答方向並鎖住 */
export function applyHint(board, i) {
  const c = board.cells[i];
  if (!c || c.locked) return false;
  c.rot = 0;
  c.locked = true;
  c.hinted = true;
  return true;
}

export function cloneBoard(board) {
  return { ...board, cells: board.cells.map((c) => ({ ...c })) };
}
