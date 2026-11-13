/* ===== audio.js — 音效與背景音樂（全部用 Web Audio 即時合成，沒有外部音檔）===== */
import { store } from './storage.js';

let ctx = null;
let sfxGain, musicGain;
let musicTimer = 0;
let step = 0;
let nextTime = 0;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.connect(ctx.destination);
  musicGain.connect(ctx.destination);
  applyVolumes();
  return true;
}

/** 第一次使用者手勢後呼叫，解鎖音訊並視設定開始播音樂 */
export function unlockAudio() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  syncMusic();
}

export function applyVolumes() {
  if (!ctx) return;
  const s = store().settings;
  sfxGain.gain.value = s.sfx ? s.sfxVol * 0.5 : 0;
  musicGain.gain.value = s.music ? s.musicVol * 0.16 : 0;
  syncMusic();
}

function tone(freq, t0, dur, { type = 'sine', gain = 0.5, to = null, dest = sfxGain } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

const SFX = {
  // 轉水管：金屬喀一聲
  turn(t) {
    tone(520, t, 0.07, { type: 'triangle', gain: 0.5, to: 320 });
    tone(1800, t, 0.03, { type: 'square', gain: 0.08 });
  },
  // 鎖住轉不動
  locked(t) {
    tone(130, t, 0.12, { type: 'square', gain: 0.22, to: 90 });
  },
  // 水流進新的水管：咕嚕往上
  water(t) {
    tone(380, t, 0.16, { gain: 0.35, to: 760 });
    tone(560, t + 0.07, 0.14, { gain: 0.22, to: 980 });
  },
  undo(t) {
    tone(420, t, 0.08, { type: 'triangle', gain: 0.35, to: 560 });
  },
  hint(t) {
    tone(880, t, 0.12, { gain: 0.3 });
    tone(1320, t + 0.09, 0.2, { gain: 0.3 });
  },
  // 開局倒數 3、2、1
  count(t) {
    tone(660, t, 0.13, { type: 'triangle', gain: 0.4 });
  },
  // 開始！
  go(t) {
    tone(880, t, 0.14, { type: 'triangle', gain: 0.42 });
    tone(1320, t + 0.1, 0.3, { type: 'triangle', gain: 0.42 });
  },
  click(t) {
    tone(660, t, 0.05, { type: 'triangle', gain: 0.25 });
  },
  win(t) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.1, 0.32, { type: 'triangle', gain: 0.4 }));
  },
  star(t) {
    tone(1175, t, 0.18, { gain: 0.32 });
    tone(1568, t + 0.06, 0.24, { gain: 0.26 });
  },
  achievement(t) {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.07, 0.25, { gain: 0.3 }));
  },
};

export function sfx(name) {
  const s = store().settings;
  if (!s.sfx || !ctx || ctx.state !== 'running') return;
  SFX[name]?.(ctx.currentTime + 0.005);
}

export function vibrate(ms) {
  if (store().settings.vibrate && navigator.vibrate) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* 有些瀏覽器不允許，忽略 */
    }
  }
}

/* ---------- 背景音樂：五聲音階的水滴撥音，每 16 拍循環、每輪換一組和弦 ---------- */
const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
const PATTERNS = [
  [0, -1, 2, -1, 4, -1, 2, 3, 5, -1, 4, -1, 2, -1, 3, -1],
  [1, -1, 3, -1, 5, -1, 3, 4, 6, -1, 5, -1, 3, -1, 1, -1],
  [0, -1, 4, -1, 5, -1, 4, 2, 7, -1, 5, -1, 4, -1, 2, -1],
  [3, -1, 2, -1, 4, -1, 1, 2, 4, -1, 2, -1, 1, -1, 0, -1],
];
const BASS = [130.81, 146.83, 110, 98];
const BEAT = 0.3;

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  while (nextTime < ctx.currentTime + 0.4) {
    const bar = Math.floor(step / 16) % PATTERNS.length;
    const note = PATTERNS[bar][step % 16];
    if (note >= 0) tone(SCALE[note], nextTime, 0.5, { gain: 0.5, dest: musicGain });
    if (step % 8 === 0) tone(BASS[bar], nextTime, 1.6, { type: 'triangle', gain: 0.45, dest: musicGain });
    step++;
    nextTime += BEAT;
  }
}

function syncMusic() {
  const want = !!ctx && store().settings.music && !document.hidden;
  if (want && !musicTimer) {
    nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 120);
  } else if (!want && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = 0;
  }
}

document.addEventListener('visibilitychange', syncMusic);
