/* ===== lobby-link.js — 「返回遊戲大廳」網址解析 =====
 * 優先序：?lobby=網址 → 本分頁先前記住的 → 來源頁(referrer) → 預設的遊戲大廳網址
 * 只接受 http(s) 絕對網址或相對路徑，避免 javascript: 之類的注入。
 */
const DEFAULT_LOBBY = 'https://pjh-eric.github.io/game-lobby/';
const KEY = 'pipe-connect.lobby';

export function resolveLobby(queryValue, stored, referrer) {
  const raw = String(queryValue || stored || referrer || '').trim();
  if (!raw || !/^(https?:\/\/|\/|\.{1,2}\/)/i.test(raw)) return null;
  return raw;
}

export function lobbyUrl() {
  let query = '', stored = '';
  try { query = new URLSearchParams(location.search).get('lobby') || ''; } catch { /* 忽略 */ }
  try { stored = sessionStorage.getItem(KEY) || ''; } catch { /* 忽略 */ }
  let url = resolveLobby(query, stored, document.referrer);
  if (!url || url.indexOf(location.origin + location.pathname) === 0) url = DEFAULT_LOBBY;
  try { if (query) sessionStorage.setItem(KEY, url); } catch { /* 忽略 */ }
  return url;
}
