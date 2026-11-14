/* ===== i18n.js — 語系切換（繁體中文／简体中文／English）===== */
import { LOCALES } from './locales.js';
import { store, save } from './storage.js';

export const LANGS = [
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'en', label: 'English' },
];
let lang = 'zh-Hant';
const listeners = [];

export function initI18n() {
  const saved = store().lang;
  lang = LANGS.some((l) => l.id === saved) ? saved : 'zh-Hant';
  applyDocument();
}

export function t(key, params) {
  let s = LOCALES[lang][key];
  if (s == null) s = LOCALES['zh-Hant'][key];
  if (s == null) return key;
  // 巡檢用：把每段文字加長四成，模擬比較長的語言，檢查版面撐不撐得住
  if (window.__PIPE_PSEUDO__ && !key.startsWith('doc.')) s = s + '·' + s.slice(0, Math.ceil(s.length * 0.4));
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m)) : s;
}

export function getLang() {
  return lang;
}

export function setLang(id) {
  if (id === lang || !LANGS.some((l) => l.id === id)) return;
  lang = id;
  store().lang = id;
  save();
  applyDocument();
  listeners.forEach((f) => f(id));
}

export function onLangChange(f) {
  listeners.push(f);
}

function applyDocument() {
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('doc.desc'));
}

// 共用的 analytics.js 會讀 window.I18N.lang
window.I18N = { get lang() { return lang; } };
