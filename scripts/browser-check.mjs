/* ===== browser-check.mjs — 用無頭瀏覽器實際開遊戲：玩完一局、檢查各尺寸有沒有破版，並輸出截圖 =====
 * 用法：node scripts/browser-check.mjs [--shots]
 * 需要 playwright（不列為專案依賴；沒有安裝時會提示並結束）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'screenshots');
const wantShots = process.argv.includes('--shots');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const skipFlow = process.argv.includes('--skip-flow');
let chromium;
try {
  const require = createRequire(import.meta.url);
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright'));
} catch {
  console.log('找不到 playwright，略過瀏覽器檢查（npm i -g playwright 或設定 PLAYWRIGHT_PATH）');
  process.exit(0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  fs.readFile(path.join(ROOT, 'public', rel), (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream' }).end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

const VIEWPORTS = [
  ['phone-portrait', 390, 844], ['phone-landscape', 844, 390], ['phone-small', 320, 568],
  ['tablet-portrait', 820, 1180], ['tablet-landscape', 1180, 820], ['desktop', 1440, 900],
];
const LANGS = ['zh-Hant', 'en', 'zh-Hans'];
const problems = [];
const note = (msg) => {
  problems.push(msg);
  console.log('  ✗ ' + msg);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

/** 檢查目前畫面：水平溢出、被裁掉的文字、超出視窗的可操作元件、太小的觸控目標 */
async function audit(page, tag) {
  const issues = await page.evaluate(() => {
    const out = [];
    const vw = innerWidth, vh = innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) out.push('頁面水平溢出 ' + document.documentElement.scrollWidth);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const modal = document.querySelector('#overlays .modal-backdrop:last-of-type');
    const scope = modal || document.getElementById('app');
    for (const el of scope.querySelectorAll('button, a, [role="slider"], [role="switch"]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 16);
      if (r.left < -1 || r.right > vw + 1) out.push(`「${name}」超出左右邊界`);
      // 在捲動區裡的元件可以捲到，不算超出
      if (!el.closest('.sa-view, .tabs') && (r.top < -1 || r.bottom > vh + 1)) out.push(`「${name}」超出上下邊界`);
      if (r.width < 40 || r.height < 40) out.push(`「${name}」觸控目標太小 ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (!el.getAttribute('aria-label') && !el.textContent.trim()) out.push('有按鈕沒有名稱：' + el.className);
    }
    for (const el of scope.querySelectorAll('.btn-label, .chip-value, .chip-name, .tab-label, .card-title, .modal-title, .tag, .level-num, .res-stat b')) {
      if (visible(el) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') out.push(`文字被裁切：「${el.textContent.trim().slice(0, 16)}」`);
    }
    for (const el of scope.querySelectorAll('.sa-view')) {
      if (el.scrollWidth > el.clientWidth + 1) out.push('捲動區水平溢出');
    }
    return out;
  });
  issues.forEach((i) => note(`${tag}：${i}`));
  if (wantShots) await page.screenshot({ path: path.join(SHOTS, tag + '.png') });
}

async function open(vw, vh, lang, seed) {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: vw < 1300 });
  const page = await context.newPage();
  page.on('pageerror', (e) => note('頁面錯誤：' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') note('console 錯誤：' + m.text());
  });
  await page.addInitScript(([l, s]) => {
    window.__PIPE_TEST__ = true;
    if (!localStorage.getItem('pipe-connect.v1')) localStorage.setItem('pipe-connect.v1', JSON.stringify({ lang: l, settings: { music: false, sfx: false }, ...(s || {}) }));
  }, [lang, seed]);
  await page.goto(URL_);
  await page.waitForSelector('#app[data-ready]');
  return { context, page };
}

const click = (page, sel) => page.locator(sel).first().click();
const settle = (page, ms = 350) => page.waitForTimeout(ms);

/* ---------- 1. 完整流程：闖關第一關玩到過關 → 下一關 → 回選關 → 首頁 ---------- */
console.log('流程檢查');
if (!skipFlow) {
  const { context, page } = await open(1180, 820, 'zh-Hant');
  await click(page, '.mode-campaign');
  await page.waitForSelector('.level');
  if ((await page.locator('.level:not(.is-locked)').count()) !== 1) note('新玩家應該只有第 1 關可玩');
  await page.locator('.level').nth(3).click({ force: true });
  if (!(await page.locator('.toast.show').count())) note('點鎖住的關卡沒有提示');
  await click(page, '.level');
  await page.waitForFunction(() => window.__game?.session);
  await settle(page, 500);
  // 真的用滑鼠點盤面中央，確認點擊能換算到格子並旋轉
  const before = await page.evaluate(() => window.__game.session.moves);
  const box = await page.locator('.stage-canvas').boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.5], [0.58, 0.42], [0.5, 0.6]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const after = await page.evaluate(() => window.__game.session.moves);
  if (after <= before) note('點擊盤面沒有轉動任何水管');
  await page.keyboard.press('z');
  // 鍵盤：方向鍵＋空白鍵
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  // 用提示把剩下的解完（幼幼提示不限）
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__game.session.done)) break;
    await page.keyboard.press('h');
  }
  if (!(await page.evaluate(() => window.__game.session.done))) note('提示用完仍未過關');
  await page.waitForSelector('.modal-result', { timeout: 5000 });
  await settle(page, 700);
  await audit(page, 'flow-result');
  const labels = await page.locator('.modal-result .modal-foot .btn').allTextContents();
  if (labels.length !== 4) note('闖關結算應有四顆按鈕，實際：' + labels.join('/'));
  if (!(await page.evaluate(() => !!document.querySelector('.stage-canvas')))) note('結算時盤面被卸載了');
  await click(page, '.modal-result .btn-primary');
  await page.waitForFunction(() => window.__game?.session && !window.__game.session.done);
  if (!(await page.locator('#top-title').textContent()).includes('2')) note('下一關沒有進到第 2 關');
  // 暫停 → 繼續 → 再暫停 → 回選關
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-menu');
  await audit(page, 'flow-pause');
  await page.keyboard.press('Escape');
  if (await page.locator('.modal-menu').count()) note('Esc 沒有關閉暫停視窗');
  await click(page, '#btn-pause');
  await page.locator('.modal-menu .btn').nth(2).click();
  await page.waitForSelector('.level');
  if ((await page.locator('.level:not(.is-locked)').count()) !== 2) note('過第 1 關後應解鎖第 2 關');
  if (!(await page.locator('.level.is-done').count())) note('選關畫面沒有顯示過關星星');
  await page.goBack();
  await page.waitForSelector('.home');
  // 重新整理後進度還在
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pipe-connect.v1')).progress.camp.tot.stars[0]);
  if (saved !== 3) note('重新整理後闖關進度沒有保留');
  // 設定：開關、恢復預設、Esc 關閉後焦點回到齒輪
  await click(page, '#btn-settings');
  await page.waitForSelector('.modal-settings');
  await audit(page, 'flow-settings');
  await page.locator('.modal-settings .switch').nth(3).click();
  if (!(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')))) note('減少動態沒有立即套用');
  await page.locator('.modal-settings .modal-foot .btn').first().click();
  if (await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'))) note('恢復預設沒有還原減少動態');
  await page.keyboard.press('Escape');
  if ((await page.evaluate(() => document.activeElement.id)) !== 'btn-settings') note('關閉設定後焦點沒有回到設定按鈕');
  // 語言切換並保留
  await click(page, '#btn-lang');
  await page.locator('.menu-item').nth(2).click();
  if (!(await page.locator('h1').textContent()).includes('Pipe')) note('切換英文後首頁標題沒有變');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  if ((await page.evaluate(() => document.documentElement.lang)) !== 'en') note('重新整理後語言沒有保留');
  // 每日挑戰與隨機都能開局
  await click(page, '.mode-daily');
  await page.locator('.diff-card').nth(4).click();
  await page.waitForFunction(() => window.__game?.session);
  const myth = await page.evaluate(() => ({ wrap: window.__game.session.board.wrap, colors: window.__game.session.board.colors, hints: window.__game.session.hintsLeft }));
  if (!myth.wrap || myth.colors < 3 || myth.hints !== 1) note('神話每日挑戰的規格不對：' + JSON.stringify(myth));
  await page.goBack();
  await page.goBack();
  await click(page, '.mode-random');
  await page.locator('.diff-card').nth(1).click();
  await page.waitForFunction(() => window.__game?.session);
  await context.close();
}

/* ---------- 2. 各尺寸 × 語言的版面檢查 ---------- */
console.log('版面檢查');
const seeded = { progress: { camp: { tot: { stars: [3, 3, 2, 1, 3] }, easy: { stars: [3, 2] } }, daily: {}, stats: { clears: 7, taps: 120, seconds: 432, hints: 3, perfect: 2, maxStreak: 2 }, ach: { first: 1 } } };
for (const [name, vw, vh] of VIEWPORTS) {
  if (only && !only.split(',').includes(name)) continue;
  for (const lang of LANGS) {
    if (lang === 'zh-Hans' && name !== 'phone-portrait') continue; // 簡中字寬與繁中相同，抽一個尺寸確認
    const { context, page } = await open(vw, vh, lang, seeded);
    const tag = (s) => `${name}-${lang}-${s}`;
    await settle(page, 900);
    await audit(page, tag('home'));
    await click(page, '.mode-campaign');
    await settle(page);
    await audit(page, tag('levels'));
    await page.locator('.level').nth(1).click();
    await page.waitForFunction(() => window.__game?.session);
    await settle(page, 600);
    await audit(page, tag('game'));
    await page.goBack();
    await page.goBack();
    await click(page, '.mode-daily');
    await settle(page);
    await audit(page, tag('daily'));
    // 最大的盤面：神話、邊緣相通、多色
    await page.locator('.diff-card').nth(4).click();
    await page.waitForFunction(() => window.__game?.session);
    await settle(page, 600);
    await audit(page, tag('game-myth'));
    await page.evaluate(() => {
      const g = window.__game;
      for (let i = 0; i < 600 && !g.session.done; i++) {
        const k = g.session.board.cells.findIndex((c) => !c.locked && c.rot % (c.mask === 15 ? 1 : c.mask === 5 || c.mask === 10 ? 2 : 4) !== 0);
        if (k < 0) break;
        g.doTap(k);
      }
    });
    await page.waitForSelector('.modal-result', { timeout: 6000 });
    await settle(page, 900);
    await audit(page, tag('result'));
    await page.locator('.modal-result .modal-foot .btn').last().click();
    await page.waitForSelector('.home');
    await click(page, '.mode-random');
    await settle(page);
    await audit(page, tag('random'));
    await page.goBack();
    await page.locator('.home-more .btn').nth(0).click();
    await settle(page);
    await audit(page, tag('help'));
    await page.goBack();
    await page.locator('.home-more .btn').nth(1).click();
    await settle(page);
    await audit(page, tag('stats'));
    await click(page, '#btn-settings');
    await settle(page);
    await audit(page, tag('settings'));
    await page.keyboard.press('Escape');
    await click(page, '#btn-lang');
    await settle(page, 150);
    if (wantShots) await page.screenshot({ path: path.join(SHOTS, tag('lang') + '.png') });
    await context.close();
    console.log(`  ${name} ${lang} 完成`);
  }
}

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n瀏覽器檢查發現 ${problems.length} 個問題`);
  process.exit(1);
}
console.log('\n瀏覽器檢查全部通過');
