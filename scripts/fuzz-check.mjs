/* ===== fuzz-check.mjs — 亂按測試：用固定種子隨機點盤面、按鍵、按鈕、暫停、重來、換語言、轉向、離開再進來，
 * 每一步之後檢查「規則狀態」「3D 畫面」「資訊列」三者一致，而且沒有任何錯誤。
 * 用法：node scripts/fuzz-check.mjs [種子] [步數]     需要 playwright（PLAYWRIGHT_PATH／CHROME_PATH）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeRng } from '../public/js/core/rng.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'));
} catch {
  console.log('找不到 playwright，略過亂按測試');
  process.exit(0);
}
const seed = process.argv[2] || 'fuzz-1';
const steps = Number(process.argv[3]) || 220;
const rng = makeRng(seed);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  fs.readFile(path.join(ROOT, rel), (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream' }).end(data)));
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const problems = [];
const trail = [];
const note = (m) => {
  problems.push(m);
  console.log('  ✗ ' + m + '   （前幾步：' + trail.slice(-6).join(' → ') + '）');
};
page.on('pageerror', (e) => note('頁面錯誤：' + e.message));
page.on('console', (m) => m.type() === 'error' && note('console 錯誤：' + m.text()));
await page.addInitScript(() => {
  window.__PIPE_TEST__ = true;
  if (!localStorage.getItem('pipe-connect.v1')) localStorage.setItem('pipe-connect.v1', JSON.stringify({ settings: { music: false, sfx: false } }));
});
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForSelector('#app[data-ready]');

/** 進一局：隨機挑模式與難度 */
async function enterGame() {
  await page.evaluate(() => history.state?.depth && history.go(-history.state.depth));
  await page.waitForSelector('.home');
  const mode = rng.pick(['campaign', 'random', 'daily']);
  await page.locator('.mode-' + mode).click();
  if (mode === 'campaign') {
    await page.locator('.tab').nth(rng.int(5)).click();
    await page.locator('.levels-continue').click();
  } else await page.locator('.diff-card').nth(rng.int(5)).click();
  await page.waitForFunction(() => window.__game?.session);
  trail.push('進入' + mode);
}

/** 三方一致性檢查 */
async function check(label) {
  const bad = await page.evaluate(async () => {
    const out = [];
    const g = window.__game;
    if (!g) return out;
    const { flow, period } = await import('./js/core/rules.js');
    const s = g.session, sc = g.scene;
    const f = flow(s.board);
    if ([...f.color].join() !== [...s.flow.color].join()) out.push('對局記的水流和盤面實際算出來的不一樣');
    if (f.solved !== s.done) out.push(`過關狀態不一致：盤面 ${f.solved}／對局 ${s.done}`);
    s.board.cells.forEach((c, i) => {
      const p = period(c.mask);
      const cell = sc.cells[i];
      if ((((cell.turns - c.rot) % p) + p) % p !== 0) out.push(`第 ${i} 格畫面方向和規則不一致（畫面 ${cell.turns}／規則 ${c.rot}）`);
      if (cell.colorCode !== s.flow.color[i]) out.push(`第 ${i} 格畫面顏色和水流不一致`);
    });
    if (s.moves < 0 || s.hintsLeft < 0 || s.hintsUsed < 0) out.push('步數或提示次數變成負的');
    if (s.undoStack.some((i) => s.board.cells[i].locked)) out.push('復原紀錄裡有鎖住的水管');
    const shown = document.querySelector('.chip-moves .chip-value')?.textContent || '';
    if (parseInt(shown, 10) !== s.moves) out.push(`資訊列步數 ${shown} 和實際 ${s.moves} 不一致`);
    const wet = document.querySelector('.chip-wet .chip-value')?.textContent || '';
    if (parseInt(wet, 10) !== s.flow.wet) out.push(`資訊列通水 ${wet} 和實際 ${s.flow.wet} 不一致`);
    if (document.querySelectorAll('#overlays .modal-backdrop').length > 1) out.push('同時開了兩個彈窗');
    if (document.querySelectorAll('.stage-canvas').length !== 1) out.push('畫布數量不是 1');
    const cdShown = !document.querySelector('.countdown')?.hidden && !document.querySelector('.countdown.go');
    if (cdShown !== g.counting) out.push(`倒數遮罩顯示 ${cdShown} 和狀態 ${g.counting} 不一致`);
    if (g.counting && s.runningSince >= 0) out.push('倒數中卻在計時');
    return [...new Set(out)].slice(0, 4);
  });
  bad.forEach((b) => note(`${label}：${b}`));
}

const box = () => page.locator('.stage').boundingBox();
const ACTIONS = {
  async 點盤面() {
    const b = await box();
    for (let i = 0, n = 1 + rng.int(6); i < n; i++) await page.mouse.click(b.x + b.width * (0.15 + rng.next() * 0.7), b.y + b.height * (0.15 + rng.next() * 0.7));
  },
  async 鍵盤() {
    for (let i = 0, n = 1 + rng.int(8); i < n; i++) await page.keyboard.press(rng.pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Space', 'Enter', 'z', 'h', '+', '-', '0']));
  },
  async 復原() { await page.locator('.bar .btn').nth(0).click({ force: true }); },
  async 提示() { await page.locator('.bar .btn').nth(1).click({ force: true }); },
  async 重來() {
    await page.locator('.bar .btn').nth(2).click({ force: true });
    if (await page.locator('.modal-confirm').count()) await page.locator('.modal-confirm .modal-foot .btn').nth(rng.int(2)).click();
  },
  async 暫停() {
    await page.keyboard.press('Escape');
    if (!(await page.locator('.modal-menu').count())) return;
    await page.waitForTimeout(rng.int(300));
    const pick = rng.int(4);
    if (pick < 2) await page.keyboard.press('Escape');
    else await page.locator('.modal-menu .btn').nth(pick === 2 ? 0 : 1).click();
  },
  async 拖曳視角() {
    const b = await box();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + rng.int(160) - 80, b.y + b.height / 2 + rng.int(120) - 60, { steps: 3 });
    await page.mouse.up();
  },
  async 滾輪() { await page.mouse.wheel(0, rng.int(600) - 300); },
  async 換語言() {
    await page.locator('#btn-lang').click();
    await page.locator('.menu-item').nth(rng.int(3)).click();
  },
  async 設定() {
    await page.locator('#btn-settings').click();
    await page.locator('.modal-settings .switch').nth(rng.int(5)).click();
    await page.keyboard.press('Escape');
  },
  async 轉向() {
    const [w, h] = rng.pick([[900, 700], [420, 800], [820, 400], [1300, 800], [340, 600]]);
    await page.setViewportSize({ width: w, height: h });
  },
  async 等一下() { await page.waitForTimeout(200 + rng.int(3200)); },
  async 離開再進來() { await enterGame(); },
  async 重新整理() {
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    await enterGame();
  },
};
const WEIGHTED = ['點盤面', '點盤面', '點盤面', '點盤面', '鍵盤', '鍵盤', '復原', '提示', '重來', '暫停', '暫停', '拖曳視角', '滾輪', '換語言', '設定', '轉向', '等一下', '等一下', '離開再進來', '重新整理'];

await enterGame();
for (let step = 1; step <= steps && problems.length < 8; step++) {
  // 過關後的結算：隨機選一顆按鈕，然後確保還在一局裡
  if (await page.locator('.modal-result').count().then((n) => n) || (await page.evaluate(() => window.__game?.session.done))) {
    await page.waitForSelector('.modal-result', { timeout: 5000 }).catch(() => note('過關後 5 秒內沒有出現結算'));
    const btns = page.locator('.modal-result .modal-foot .btn');
    const n = await btns.count();
    if (n) await btns.nth(rng.int(n)).click();
    trail.push('結算選一顆');
    await page.waitForTimeout(150);
    if (!(await page.evaluate(() => !!window.__game))) await enterGame();
    continue;
  }
  const name = rng.pick(WEIGHTED);
  trail.push(name);
  try {
    await ACTIONS[name]();
  } catch (e) {
    note(`「${name}」執行失敗：${e.message.split('\n')[0]}`);
  }
  await page.waitForTimeout(40);
  if (!(await page.evaluate(() => !!window.__game))) await enterGame();
  await check(`第 ${step} 步「${name}」後`);
}

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n亂按測試（種子 ${seed}）發現 ${problems.length} 個問題`);
  process.exit(1);
}
console.log(`亂按測試通過：種子 ${seed}、${steps} 步`);
