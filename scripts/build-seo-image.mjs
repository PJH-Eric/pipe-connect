/* ===== build-seo-image.mjs — 用實際遊戲畫面產生社群分享圖 public/assets/images/seo.webp（1200×630）=====
 * 需要 playwright 與 sharp（PLAYWRIGHT_PATH／SHARP_PATH 可指定位置）；平常不用跑，換美術時才需要。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const sharp = require(process.env.SHARP_PATH || 'sharp');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  fs.readFile(path.join(ROOT, rel), (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream' }).end(data)));
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  window.__PIPE_TEST__ = true;
  window.__PIPE_SKIP_COUNTDOWN__ = true;
  localStorage.setItem('pipe-connect.v1', JSON.stringify({ settings: { music: false, sfx: false } }));
});
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForSelector('#app[data-ready]');
await page.evaluate(() => history.pushState({ name: 'game', params: { mode: 'campaign', diff: 'hard', index: 45 }, depth: 1 }, ''));
await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state })));
await page.waitForFunction(() => window.__game?.session);
await page.evaluate(() => {
  const g = window.__game;
  // 留幾節沒接好，畫面上才看得出「正在解題」
  g.session.board.cells.forEach((c) => (c.rot = 0));
  g.session.done = true; // 只是擺拍，不要觸發結算
  g.session._refresh();
  const far = [...g.session.flow.dist.keys()].sort((a, b) => g.session.flow.dist[b] - g.session.flow.dist[a]).slice(0, 3);
  far.forEach((i) => (g.session.board.cells[i].rot = 1));
  g.session._refresh();
  document.activeElement?.blur();
  g.scene.setBoard(g.session.board);
  g.scene.applyFlow(g.session.flow, { instant: true });
  document.querySelector('.game-side').style.visibility = 'hidden';
  document.querySelector('.topbar').style.visibility = 'hidden';
  document.querySelector('.zoom').hidden = true;
  document.querySelector('.stage-tip').hidden = true;
  document.querySelector('.game').style.gridTemplate = '"side stage" minmax(0, 1fr) / 430px minmax(0, 1fr)';
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:56px;top:0;bottom:0;width:400px;display:flex;flex-direction:column;justify-content:center;gap:18px;z-index:99;color:#eef6ff';
  el.innerHTML = '<div style="font-size:92px;font-weight:900;line-height:1.1;text-shadow:0 6px 0 rgba(0,0,0,.3)">水管<br>接通</div><div style="font-size:30px;font-weight:800;color:#37d6e8">3D 水管益智遊戲</div><div style="font-size:23px;font-weight:700;color:#a9c1d8;line-height:1.5">闖關・隨機・每日挑戰<br>免費免下載，手機平板都能玩</div>';
  document.body.append(el);
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(1200);
const png = await page.screenshot();
await browser.close();
server.close();
const out = path.join(ROOT, 'assets', 'images');
fs.mkdirSync(out, { recursive: true });
await sharp(png).webp({ quality: 86 }).toFile(path.join(out, 'seo.webp'));
console.log('已產生 public/assets/images/seo.webp');
