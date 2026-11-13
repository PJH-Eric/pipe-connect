/* ===== contrast-check.mjs — 檢查主要文字與底色的對比（WCAG AA：一般文字 4.5、大字與圖示 3）=====
 * 色碼直接從 public/css/style.css 的 :root 變數讀出來，改了配色就會跟著檢查。
 */
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
const vars = {};
// 只取 :root 裡的第一個定義（後面有元件會局部覆寫同名變數）
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] ??= m[2];
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const v = (name) => {
  if (!vars[name]) throw new Error('style.css 找不到變數 --' + name);
  return vars[name];
};

// [說明, 前景, 背景, 最低對比]
const PAIRS = [
  ['一般文字／面板', v('ink'), v('panel'), 4.5],
  ['一般文字／深色背景', v('ink'), v('bg'), 4.5],
  ['次要文字／面板', v('mute'), v('panel'), 4.5],
  ['次要文字／亮面板', v('mute'), v('panel2'), 4.5],
  ['次要文字／深色背景', v('mute'), v('bg2'), 4.5],
  ['主要按鈕文字／青色', v('accent-ink'), v('accent'), 4.5],
  ['分頁副標／青色', v('tab-sub-on'), v('accent'), 4.5],
  ['金色文字／面板', v('gold'), v('panel'), 4.5],
  ['警告框文字／紅底', v('ink'), v('warn-bg'), 4.5],
  ['未解鎖成就文字／暗底', v('dim'), v('dim-bg'), 4.5],
  ['鎖住關卡數字／暗底（停用狀態，至少 3）', v('lock-ink'), v('dim-bg'), 3],
  ['青色圖示／面板', v('accent'), v('panel'), 3],
  ['邊框／深色背景（元件邊界，至少 1.5 以外另有陰影）', v('line'), v('bg'), 1.5],
];

let bad = 0;
for (const [name, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name}：${r.toFixed(2)}（至少 ${min}）`);
}
if (bad) {
  console.log(`\n有 ${bad} 組對比不足`);
  process.exit(1);
}
console.log('\n對比檢查全部通過');
