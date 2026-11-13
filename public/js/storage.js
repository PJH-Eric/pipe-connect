/* ===== storage.js — 本機存檔（localStorage，壞掉或被停用時退回記憶體）===== */
import { normalizeProgress } from './core/progress.js';

const KEY = 'pipe-connect.v1';
export const DEFAULT_SETTINGS = { music: true, musicVol: 0.5, sfx: true, sfxVol: 0.8, vibrate: true, reduceMotion: false };

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
    progress: normalizeProgress(raw.progress),
  };
}

export function store() {
  if (!data) load();
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store()));
  } catch {
    /* 無痕模式或空間不足：這次就只留在記憶體 */
  }
}
