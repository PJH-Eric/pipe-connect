/* ===== session.js — 一局遊戲的狀態（不碰畫面）=====
 * 步數、計時、復原、提示都在這裡；畫面只要呼叫方法再照結果更新。
 */
import { flow, rotate, unrotate, canRotate, isAligned, applyHint, neighbor, DIRS } from './rules.js';
import { HINTS, rateStars, starTimeLimit } from './levels.js';

export class Session {
  /** @param info { mode: 'campaign'|'random'|'daily', diff, index?, dateKey?, seed? } */
  constructor(board, info) {
    this.board = board;
    this.info = info;
    this.par = board.par;
    this.moves = 0;
    this.hintsUsed = 0;
    this.hintsLeft = HINTS[info.diff];
    this.undoStack = [];
    this.elapsedMs = 0;
    this.runningSince = -1; // 第一次轉動才開始計時
    this.started = false;
    this.done = false;
    this.flow = flow(board);
  }

  /** 點一節水管。回傳 { ok, reason?, solved } */
  tap(i, now = Date.now()) {
    if (this.done) return { ok: false, reason: 'done' };
    const cell = this.board.cells[i];
    if (!cell) return { ok: false, reason: 'none' };
    if (cell.locked) return { ok: false, reason: 'locked' };
    if (!canRotate(this.board, i)) return { ok: false, reason: 'cross' };
    this._begin(now);
    rotate(this.board, i);
    this.moves++;
    this.undoStack.push(i);
    if (this.undoStack.length > 500) this.undoStack.shift();
    return { ok: true, solved: this._refresh(now) };
  }

  /** 復原上一步（步數不會退回）。回傳被轉回的格子，沒有可復原回傳 -1 */
  undo() {
    if (this.done || !this.undoStack.length) return -1;
    const i = this.undoStack.pop();
    unrotate(this.board, i);
    this._refresh();
    return i;
  }

  get canUndo() {
    return !this.done && this.undoStack.length > 0;
  }

  get canHint() {
    return !this.done && this.hintsLeft > 0 && this._hintTarget() >= 0;
  }

  /** 使用提示：從水源往外找第一節還沒轉對的水管，轉正並鎖住。回傳格子或 -1 */
  hint(now = Date.now()) {
    if (!this.canHint) return -1;
    const i = this._hintTarget();
    this._begin(now);
    applyHint(this.board, i);
    this.hintsLeft--;
    this.hintsUsed++;
    this.undoStack = this.undoStack.filter((k) => k !== i);
    return { i, solved: this._refresh(now) };
  }

  /** 沿著解答的水管樹，從水源一層一層往外找 */
  _hintTarget() {
    const { cells } = this.board;
    const seen = new Uint8Array(cells.length);
    let queue = [];
    cells.forEach((c, i) => {
      if (c.src) {
        seen[i] = 1;
        queue.push(i);
      }
    });
    while (queue.length) {
      const next = [];
      for (const a of queue) {
        if (!cells[a].locked && !isAligned(cells[a])) return a;
        for (let d = 0; d < 4; d++) {
          if (!(cells[a].mask & DIRS[d].bit)) continue;
          const b = neighbor(this.board, a, d);
          if (b >= 0 && !seen[b]) {
            seen[b] = 1;
            next.push(b);
          }
        }
      }
      queue = next;
    }
    return -1;
  }

  _begin(now) {
    if (!this.started) {
      this.started = true;
      this.runningSince = now;
    }
  }

  _refresh(now = Date.now()) {
    this.flow = flow(this.board);
    if (this.flow.solved && !this.done) {
      this.pause(now);
      this.done = true;
    }
    return this.flow.solved;
  }

  pause(now = Date.now()) {
    if (this.runningSince >= 0) {
      this.elapsedMs += Math.max(0, now - this.runningSince);
      this.runningSince = -1;
    }
  }

  resume(now = Date.now()) {
    if (this.started && !this.done && this.runningSince < 0) this.runningSince = now;
  }

  get paused() {
    return this.started && !this.done && this.runningSince < 0;
  }

  seconds(now = Date.now()) {
    const ms = this.elapsedMs + (this.runningSince >= 0 ? Math.max(0, now - this.runningSince) : 0);
    return ms / 1000;
  }

  /** 過關後的成績 */
  result() {
    const seconds = Math.round(this.seconds() * 10) / 10;
    const timeLimit = starTimeLimit(this.board);
    return {
      ...this.info,
      moves: this.moves,
      par: this.par,
      seconds,
      timeLimit,
      hints: this.hintsUsed,
      cells: this.board.cells.length,
      stars: rateStars({ diff: this.info.diff, par: this.par, moves: this.moves, seconds, hints: this.hintsUsed, timeLimit }),
    };
  }
}
