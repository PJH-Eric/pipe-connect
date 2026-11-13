/* ===== progress.js — 進度、紀錄、連續天數與成就（純資料運算，不碰 localStorage）===== */
import { DIFFS, LEVELS_PER_DIFF, shiftDateKey } from './levels.js';

export function emptyProgress() {
  const camp = {};
  for (const d of DIFFS) camp[d] = { stars: [], best: [] };
  return {
    camp,
    daily: {},
    stats: { clears: 0, taps: 0, seconds: 0, hints: 0, perfect: 0, random: {}, randomBest: {}, maxStreak: 0 },
    ach: {},
  };
}

/** 把讀回來的資料補齊欄位（舊版或被改壞的存檔也不會讓遊戲壞掉） */
export function normalizeProgress(raw) {
  const p = emptyProgress();
  if (!raw || typeof raw !== 'object') return p;
  for (const d of DIFFS) {
    const src = raw.camp && raw.camp[d];
    if (src && Array.isArray(src.stars)) {
      p.camp[d].stars = src.stars.slice(0, LEVELS_PER_DIFF).map((s) => Math.max(0, Math.min(3, s | 0)));
      p.camp[d].best = Array.isArray(src.best) ? src.best.slice(0, LEVELS_PER_DIFF) : [];
    }
  }
  if (raw.daily && typeof raw.daily === 'object') {
    for (const [k, v] of Object.entries(raw.daily)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') p.daily[k] = v;
    }
  }
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of ['clears', 'taps', 'seconds', 'hints', 'perfect', 'maxStreak']) {
      if (Number.isFinite(raw.stats[k])) p.stats[k] = Math.max(0, raw.stats[k]);
    }
    if (raw.stats.random && typeof raw.stats.random === 'object') p.stats.random = { ...raw.stats.random };
    if (raw.stats.randomBest && typeof raw.stats.randomBest === 'object') p.stats.randomBest = { ...raw.stats.randomBest };
  }
  if (raw.ach && typeof raw.ach === 'object') p.ach = { ...raw.ach };
  return p;
}

/** 闖關：下一個可以玩的關卡（0 起算）；全破回傳最後一關 */
export function unlockedCount(p, diff) {
  const stars = p.camp[diff].stars;
  let n = 0;
  while (n < LEVELS_PER_DIFF && stars[n] > 0) n++;
  return Math.min(LEVELS_PER_DIFF, n + 1);
}

export function isUnlocked(p, diff, idx) {
  return idx < unlockedCount(p, diff);
}

export function clearedCount(p, diff) {
  return p.camp[diff].stars.filter((s) => s > 0).length;
}

export function starTotal(p, diff) {
  return p.camp[diff].stars.reduce((a, s) => a + (s || 0), 0);
}

export function dailyDoneCount(p, dateKey) {
  const day = p.daily[dateKey];
  return day ? DIFFS.filter((d) => day[d]).length : 0;
}

/** 到 dateKey 為止連續幾天有完成至少一題（今天還沒玩不會中斷昨天的連續） */
export function dailyStreak(p, dateKey) {
  let key = dailyDoneCount(p, dateKey) > 0 ? dateKey : shiftDateKey(dateKey, -1);
  let n = 0;
  while (dailyDoneCount(p, key) > 0) {
    n++;
    key = shiftDateKey(key, -1);
  }
  return n;
}

/** 比較兩筆成績：步數少的好，同步數比時間 */
function better(a, b) {
  return !b || a.moves < b.m || (a.moves === b.m && a.seconds < b.s);
}

export const ACHIEVEMENTS = [
  'first', 'clear10', 'clear50', 'clear200', 'star10', 'star100', 'perfect', 'speed', 'nohintMyth',
  'random20', 'daily1', 'daily5', 'streak3', 'streak7', 'streak30',
  'doneTot', 'doneEasy', 'doneNormal', 'doneHard', 'doneMyth',
];

function checkAchievements(p, r, dateKey) {
  const s = p.stats;
  const threeStars = DIFFS.reduce((a, d) => a + p.camp[d].stars.filter((x) => x === 3).length, 0);
  const randomTotal = Object.values(s.random).reduce((a, b) => a + b, 0);
  const streak = dailyStreak(p, dateKey);
  const dailyTotal = Object.keys(p.daily).length;
  const hard = r.diff !== 'tot' && r.diff !== 'easy';
  return {
    first: s.clears >= 1,
    clear10: s.clears >= 10,
    clear50: s.clears >= 50,
    clear200: s.clears >= 200,
    star10: threeStars >= 10,
    star100: threeStars >= 100,
    perfect: r.diff !== 'tot' && r.moves <= r.par && r.hints === 0,
    speed: hard && r.seconds <= r.timeLimit / 2,
    nohintMyth: r.diff === 'myth' && r.hints === 0,
    random20: randomTotal >= 20,
    daily1: dailyTotal >= 1,
    daily5: dailyDoneCount(p, dateKey) >= 5,
    streak3: streak >= 3,
    streak7: streak >= 7,
    streak30: streak >= 30,
    doneTot: clearedCount(p, 'tot') >= LEVELS_PER_DIFF,
    doneEasy: clearedCount(p, 'easy') >= LEVELS_PER_DIFF,
    doneNormal: clearedCount(p, 'normal') >= LEVELS_PER_DIFF,
    doneHard: clearedCount(p, 'hard') >= LEVELS_PER_DIFF,
    doneMyth: clearedCount(p, 'myth') >= LEVELS_PER_DIFF,
  };
}

/**
 * 記錄一局成績（直接改 p）。
 * @param r Session.result() 的結果
 * @param today 今天的台北日期（算連續天數用）
 * @returns { newBest, firstClear, newAchievements: string[] }
 */
export function recordResult(p, r, today, now = Date.now()) {
  let newBest = false;
  let firstClear = false;
  const entry = { m: r.moves, s: r.seconds, st: r.stars };

  if (r.mode === 'campaign') {
    const c = p.camp[r.diff];
    firstClear = !(c.stars[r.index] > 0);
    for (let i = c.stars.length; i < r.index; i++) c.stars[i] = c.stars[i] || 0;
    c.stars[r.index] = Math.max(c.stars[r.index] || 0, r.stars);
    if (better(r, c.best[r.index])) {
      c.best[r.index] = { m: r.moves, s: r.seconds };
      newBest = !firstClear;
    }
  } else if (r.mode === 'daily') {
    const day = (p.daily[r.dateKey] ||= {});
    firstClear = !day[r.diff];
    if (better(r, day[r.diff])) {
      newBest = !firstClear;
      day[r.diff] = { ...entry, st: Math.max(r.stars, day[r.diff]?.st || 0) };
    } else if (r.stars > day[r.diff].st) {
      day[r.diff].st = r.stars;
    }
  } else {
    p.stats.random[r.diff] = (p.stats.random[r.diff] || 0) + 1;
    const prev = p.stats.randomBest[r.diff];
    if (!prev || r.seconds < prev.s) {
      p.stats.randomBest[r.diff] = { m: r.moves, s: r.seconds };
      newBest = !!prev;
    }
  }

  const s = p.stats;
  s.clears++;
  s.taps += r.moves;
  s.seconds += r.seconds;
  s.hints += r.hints;
  if (r.diff !== 'tot' && r.moves <= r.par && r.hints === 0) s.perfect++;
  s.maxStreak = Math.max(s.maxStreak, dailyStreak(p, today));

  const got = checkAchievements(p, r, today);
  const newAchievements = ACHIEVEMENTS.filter((id) => got[id] && !p.ach[id]);
  newAchievements.forEach((id) => (p.ach[id] = now));
  return { newBest, firstClear, newAchievements };
}
