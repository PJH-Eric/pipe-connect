/* ===== levels.js — 難度、關卡規格、每日挑戰與評星 ===== */
import { generate } from './generator.js';

export const DIFFS = ['tot', 'easy', 'normal', 'hard', 'myth'];
export const LEVELS_PER_DIFF = 300;
/** 每日挑戰用的關卡位置（各難度的中後段） */
const DAILY_STAGE = 70;

/** 每個難度一局可用的提示次數（Infinity＝不限） */
export const HINTS = { tot: Infinity, easy: 5, normal: 3, hard: 2, myth: 1 };

/** 第 idx 關（0 起算）的盤面規格。越後面盤面越大、機關越多。 */
export function levelSpec(diff, idx) {
  const i = Math.max(0, Math.min(LEVELS_PER_DIFF - 1, idx | 0));
  switch (diff) {
    case 'tot': {
      const s = i < 20 ? 3 : i < 70 ? 4 : i < 130 ? 5 : i < 250 ? 6 : 7;
      return { w: s, h: s, colors: 1, wrap: false, lockRatio: 0.3 };
    }
    case 'easy': {
      const s = i < 40 ? 5 : i < 80 ? 6 : i < 140 ? 7 : i < 250 ? 8 : 9;
      return { w: s, h: s, colors: 1, wrap: false, lockRatio: 0.15 };
    }
    case 'normal': {
      const s = i < 35 ? 7 : i < 70 ? 8 : i < 100 ? 9 : i < 150 ? 10 : i < 250 ? 11 : 12;
      return { w: s, h: s, colors: i < 50 ? 1 : i < 130 ? 2 : i < 250 ? 3 : 4, wrap: false, lockRatio: 0.1 };
    }
    case 'hard': {
      const s = i < 50 ? 9 : i < 100 ? 10 : i < 150 ? 11 : i < 250 ? 12 : 13;
      return { w: s, h: s, colors: i < 40 ? 2 : i < 100 ? 3 : 4, wrap: i >= 60, lockRatio: 0.08 };
    }
    case 'myth': {
      const s = i < 50 ? 11 : i < 100 ? 12 : i < 150 ? 13 : i < 250 ? 14 : 15;
      return { w: s, h: s, colors: i < 50 ? 3 : 4, wrap: true, lockRatio: 0.05 };
    }
    default:
      throw new Error('未知的難度：' + diff);
  }
}

/** 闖關：固定種子，每個人、每次進來都是同一題 */
export function campaignBoard(diff, idx) {
  return generate(levelSpec(diff, idx), `camp:${diff}:${idx}`);
}

/** 隨機：關卡位置與種子都隨機 */
export function randomBoard(diff, seed) {
  const stage = Math.abs(hashInt(String(seed))) % LEVELS_PER_DIFF;
  return generate(levelSpec(diff, stage), `rand:${diff}:${seed}`);
}

/** 每日挑戰：同一天、同難度全世界同一題 */
export function dailyBoard(diff, dateKey) {
  return generate(levelSpec(diff, DAILY_STAGE), `daily:${dateKey}:${diff}`);
}

function hashInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** 台北時間的日期字串 YYYY-MM-DD（每日挑戰以台北午夜換日） */
export function taipeiDateKey(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 日期字串加減天數 */
export function shiftDateKey(key, days) {
  const t = Date.parse(key + 'T00:00:00Z') + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 三星時間門檻（秒）：每格 4 秒 */
export function starTimeLimit(board) {
  return board.w * board.h * 4;
}

/**
 * 評星：過關 1 星；步數 ≤ 標準步數×1.6 得 2 星；
 * 步數 ≤ 標準步數×1.2、時間在門檻內且沒用提示得 3 星。
 * 幼幼班是鼓勵式，過關一律 3 星。
 */
export function rateStars({ diff, par, moves, seconds, hints, timeLimit }) {
  if (diff === 'tot') return 3;
  const p = Math.max(1, par);
  if (moves <= Math.ceil(p * 1.2) && seconds <= timeLimit && hints === 0) return 3;
  if (moves <= Math.ceil(p * 1.6)) return 2;
  return 1;
}
