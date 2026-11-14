/* ===== storage.js — 本機存檔（localStorage，壞掉或被停用時退回記憶體）===== */
import { normalizeProgress } from './core/progress.js';

const KEY = 'pipe-connect.v1';
export const DEFAULT_SETTINGS = { music: true, musicVol: 0.5, sfx: true, sfxVol: 0.8, vibrate: true, reduceMotion: false, hiQuality: true };

let data = null;

function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  raw = raw && typeof raw === 'object' ? raw : {};
  const settings = { ...DEFAULT_SETTINGS };
  if (raw.settings && typeof raw.settings === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof raw.settings[k] === typeof DEFAULT_SETTINGS[k]) settings[k] = raw.settings[k];
    }
  }
  // 第一次來、還沒自己設定過：跟著系統的「減少動態效果」
  if (typeof raw.settings?.reduceMotion !== 'boolean') {
    try {
      settings.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* 沒有 matchMedia 的環境（測試）就用預設 */
    }
  }
  data = {
    lang: typeof raw.lang === 'string' ? raw.lang : '',
    settings,
    last: raw.last && typeof raw.last === 'object' ? raw.last : {},
    // 玩到一半的對局（key → { t: 存檔時間, s: Session.snapshot() }）
    saves: raw.saves && typeof raw.saves === 'object' && !Array.isArray(raw.saves) ? raw.saves : {},
    progress: normalizeProgress(raw.progress),
  };
}

export function store() {
  if (!data) load();
  return data;
}

const MAX_SAVES = 12;

/** 讀出某一局的中途進度；沒有回傳 null */
export function loadGame(key) {
  return store().saves[key]?.s || null;
}

/** 存某一局的中途進度（最多留 12 局，舊的先丟） */
export function saveGame(key, snap, now = Date.now()) {
  const saves = store().saves;
  saves[key] = { t: now, s: snap };
  const keys = Object.keys(saves).sort((a, b) => (saves[b].t || 0) - (saves[a].t || 0));
  keys.slice(MAX_SAVES).forEach((k) => delete saves[k]);
  save();
}

export function clearGame(key) {
  if (store().saves[key]) {
    delete store().saves[key];
    save();
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store()));
  } catch {
    /* 無痕模式或空間不足：這次就只留在記憶體 */
  }
}
