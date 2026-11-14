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
  // 極端尺寸：平常不跑，用 --only= 指定（摺疊機外螢幕、超寬矮視窗、瘦長視窗、摺疊機展開、大螢幕）
  ['x-tiny', 280, 653], ['x-wide-short', 1280, 400], ['x-tall', 400, 1000], ['x-fold', 717, 512], ['x-fhd', 1920, 1080], ['x-qhd', 2560, 1440],
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
    const modal = document.querySelector('.result-share-dialog-layer:not([hidden])') || document.querySelector('#overlays .modal-backdrop:last-of-type');
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
    // 元件互相重疊：按鈕、資訊卡、標籤、卡片之間不能壓到彼此（巢狀的不算）
    const blocks = [...scope.querySelectorAll('.btn, .icon-btn, .chip, .tag, .card, .level, .tab, .stat, .ach, .pill-btn, .hud-stars, .menu-item, .res-stat, .cd-num, .cd-tip')].filter(visible);
    const rects = blocks.map((e) => e.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < blocks.length && overlaps < 3; i++) {
      for (let j = i + 1; j < blocks.length && overlaps < 3; j++) {
        if (blocks[i].contains(blocks[j]) || blocks[j].contains(blocks[i])) continue;
        const a = rects[i], b = rects[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) {
          const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().replace(/\s+/g, ' ').slice(0, 14);
          out.push(`「${name(blocks[i])}」和「${name(blocks[j])}」重疊`);
          overlaps++;
        }
      }
    }
    return out;
  });
  issues.forEach((i) => note(`${tag}：${i}`));
  if (wantShots) await page.screenshot({ path: path.join(SHOTS, tag + '.png') });
}

async function open(vw, vh, lang, seed, pseudo = false) {
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: vw < 1300 });
  const page = await context.newPage();
  page.on('pageerror', (e) => note('頁面錯誤：' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') note('console 錯誤：' + m.text());
  });
  if (pseudo) await page.addInitScript(() => (window.__PIPE_PSEUDO__ = true));
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
  // 選關的鍵盤操作：100 顆只有一個 Tab 停駐點，方向鍵在格子間移動
  {
    const tabbable = await page.locator('.level[tabindex="0"]').count();
    if (tabbable !== 1) note('選關格子應該只有一個 Tab 停駐點，實際 ' + tabbable);
    await page.locator('.level[tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    const at = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.level')];
      const cols = btns.filter((b) => b.offsetTop === btns[0].offsetTop).length;
      return { focus: btns.indexOf(document.activeElement), expect: 1 + cols, tab: document.querySelectorAll('.level[tabindex="0"]').length };
    });
    if (at.focus !== at.expect || at.tab !== 1) note('選關方向鍵移動不對：' + JSON.stringify(at));
    await page.keyboard.press('Home');
  }
  if (!/1/.test(await page.locator('.levels-continue').textContent())) note('選關畫面的「繼續」應該指向第 1 關');
  await click(page, '.levels-continue');
  await page.waitForFunction(() => window.__game?.session);
  // 開局 3、2、1 遮罩：看得到、擋住操作、倒數完才計時；倒數中暫停再繼續會重數
  await settle(page, 300);
  if (!(await page.locator('.countdown:not([hidden]) .cd-num').count())) note('開局沒有顯示倒數遮罩');
  if (!/^[123]$/.test((await page.locator('.cd-num').textContent()).trim())) note('倒數遮罩沒有顯示 3、2、1');
  if (!(await page.locator('.countdown .cd-tip').isVisible())) note('倒數遮罩裡沒有操作提示');
  await audit(page, 'flow-countdown');
  {
    const box0 = await page.locator('.stage').boundingBox();
    await page.mouse.click(box0.x + box0.width / 2, box0.y + box0.height / 2);
    await page.keyboard.press('h');
    const st = await page.evaluate(() => ({ moves: window.__game.session.moves, hints: window.__game.session.hintsUsed, started: window.__game.session.started, undo: document.querySelector('.bar .btn').disabled }));
    if (st.moves || st.hints || st.started || !st.undo) note('倒數期間仍可操作或已開始計時：' + JSON.stringify(st));
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-menu');
  if (await page.locator('.countdown:not([hidden])').count()) note('暫停時倒數遮罩沒有收起');
  await settle(page, 3300);
  if (await page.evaluate(() => window.__game.session.started)) note('倒數中暫停後，時間卻開始跑了');
  await page.keyboard.press('Escape');
  if (!(await page.evaluate(() => window.__game.counting))) note('倒數中暫停再繼續，沒有重新倒數');
  await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  if (!(await page.locator('.countdown.go').count())) note('倒數結束沒有顯示「開始！」');
  await settle(page, 900);
  if (await page.locator('.countdown:not([hidden])').count()) note('「開始！」之後遮罩沒有消失');
  await settle(page, 500);
  // 真的用滑鼠點盤面中央，確認點擊能換算到格子並旋轉
  const before = await page.evaluate(() => window.__game.session.moves);
  const box = await page.locator('.stage-canvas').boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.5], [0.58, 0.42], [0.5, 0.6]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const after = await page.evaluate(() => window.__game.session.moves);
  if (after <= before) note('點擊盤面沒有轉動任何水管');
  await page.keyboard.press('z');
  // 玩到一半把裝置轉向：盤面要重新放滿、不能跑出畫面，步數與進度不變
  {
    const before2 = await page.evaluate(() => window.__game.session.moves);
    await page.setViewportSize({ width: 820, height: 1180 });
    await settle(page, 500);
    await audit(page, 'flow-rotated');
    const m = await page.evaluate(() => window.__game.scene.measure());
    if (!m.inside || Math.max(m.fillX, m.fillY) < 0.8) note('轉成直向後盤面沒有重新放滿：' + JSON.stringify(m));
    await page.setViewportSize({ width: 1180, height: 820 });
    await settle(page, 500);
    const m2 = await page.evaluate(() => window.__game.scene.measure());
    if (!m2.inside || Math.max(m2.fillX, m2.fillY) < 0.8) note('轉回橫向後盤面沒有重新放滿：' + JSON.stringify(m2));
    if ((await page.evaluate(() => window.__game.session.moves)) !== before2) note('轉向後步數變了');
  }
  // 省電：只有水滴在動時大約隔一幀才重畫；什麼都沒在動時完全不重畫
  {
    const sample = () => page.evaluate(async () => {
      const st = window.__game.scene.stats;
      const a = { ...st };
      await new Promise((r) => setTimeout(r, 1200));
      return { ticks: st.ticks - a.ticks, renders: st.renders - a.renders, leaks: window.__game.scene.leaks.length };
    });
    await page.mouse.move(2, 2);
    await settle(page, 600);
    const dripping = await sample();
    if ((dripping.renders < 3 || dripping.renders > dripping.ticks * 0.62)) note('只有水滴在動時重畫次數不對：' + JSON.stringify(dripping));
    // 開了「減少動態」之後水滴與水柱都不動，畫面應該完全不重畫
    await page.evaluate(() => window.__game.scene.setReducedMotion(true));
    await settle(page, 400);
    const idle = await sample();
    if (idle.renders > 1) note('減少動態時畫面仍在重畫：' + JSON.stringify(idle));
    await page.evaluate(() => window.__game.scene.setReducedMotion(false));
    // 低畫質：沒有環境反光，沒水的水管不能還是高金屬感（會變成一片黑）
    const lowMat = await page.evaluate(() => {
      const g = window.__game, sc = g.scene;
      sc.setQuality('low');
      const dry = sc.cells.filter((c, i) => g.session.flow.color[i] === 0);
      const bad = dry.filter((c) => c.material.metalness > 0.2).length;
      sc.setQuality('high');
      return { dry: dry.length, bad, back: dry.every((c) => c.material.metalness > 0.5) };
    });
    if (lowMat.bad || !lowMat.back) note('切換畫質時沒水的水管材質不對：' + JSON.stringify(lowMat));
    // 水龍頭：每個出水口都要有往外流的箭頭（兩個一組），數量跟開口一致
    const taps = await page.evaluate(() => {
      const g = window.__game;
      return g.session.board.cells.map((c, i) => ({ c, i })).filter((x) => x.c.src).map((x) => {
        const open = [1, 2, 4, 8].filter((b) => x.c.mask & b).length;
        return { open, arrows: g.scene.cells[x.i].flows.length };
      });
    });
    if (!taps.length || taps.some((x) => x.arrows !== x.open * 2)) note('水龍頭出水口的箭頭數量不對：' + JSON.stringify(taps));
  }
  // 視角：沒放大時拖曳是轉視角；放大後拖曳改成平移；視角復位會全部還原
  {
    const drag = async () => {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 10, { steps: 4 });
      await page.mouse.up();
      return page.evaluate(() => ({ ...window.__game.scene.view }));
    };
    const movesBefore = await page.evaluate(() => window.__game.session.moves);
    const a = await drag();
    if (a.az === 0 || a.panX !== 0) note('沒放大時拖曳應該轉視角：' + JSON.stringify(a));
    await page.locator('.zoom .icon-btn').nth(2).click();
    await page.locator('.zoom .icon-btn').nth(0).click();
    const b2 = await drag();
    if (b2.az !== 0 || b2.panX === 0) note('放大後拖曳應該平移：' + JSON.stringify(b2));
    await page.locator('.zoom .icon-btn').nth(2).click();
    const c = await page.evaluate(() => ({ ...window.__game.scene.view }));
    if (c.zoom !== 1 || c.panX !== 0 || c.az !== 0) note('視角復位沒有還原：' + JSON.stringify(c));
    if ((await page.evaluate(() => window.__game.session.moves)) !== movesBefore) note('拖曳視角時誤轉了水管');
  }
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
  await page.waitForSelector('.modal-result', { timeout: 20000 });
  await settle(page, 700);
  await audit(page, 'flow-result');
  const labels = await page.locator('.modal-result .modal-foot .btn').allTextContents();
  if (labels.length !== 4) note('闖關結算應有四顆按鈕，實際：' + labels.join('/'));
  if (!(await page.evaluate(() => !!document.querySelector('.stage-canvas')))) note('結算時盤面被卸載了');
  // 分享結果：做出圖片、可下載、Esc 只關分享視窗不關結算
  await click(page, '.result-share-trigger');
  await page.waitForSelector('.result-share-image:not([hidden])', { timeout: 40000 }).catch(() => note('分享圖片沒有產生'));
  await audit(page, 'flow-share');
  const share = await page.evaluate(async () => {
    const img = document.querySelector('.result-share-image');
    const bmp = img?.src ? await createImageBitmap(await (await fetch(img.src)).blob()) : null;
    return { w: bmp?.width || 0, h: bmp?.height || 0, download: !document.querySelector('.result-share-image-download')?.disabled };
  });
  if (share.w !== 1080 || share.h < 600) note('分享圖片尺寸不對：' + JSON.stringify(share));
  if (!share.download) note('分享圖片做好後下載鈕仍是停用');
  await page.keyboard.press('Escape');
  if (await page.locator('.result-share-dialog-layer').count()) note('Esc 沒有關閉分享視窗');
  if (!(await page.locator('.modal-result').count())) note('關閉分享視窗時結算也被關掉了');
  await click(page, '.modal-result .btn-primary');
  await page.waitForFunction(() => window.__game?.session && !window.__game.session.done && window.__game.counting);
  await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  if (!(await page.locator('#top-title').textContent()).includes('2')) note('下一關沒有進到第 2 關');
  // 玩到一半離開再回來、甚至重新整理，都要接著上次的進度
  {
    await page.evaluate(() => {
      const g = window.__game;
      const k = g.session.board.cells.findIndex((c) => !c.locked && c.mask !== 15 && c.mask !== 5 && c.mask !== 10);
      for (let i = 0; i < 3; i++) g.doTap(k);
    });
    const rots = await page.evaluate(() => window.__game.session.board.cells.map((c) => c.rot).join(''));
    await page.goBack();
    await page.waitForSelector('.levels-continue');
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    await click(page, '.mode-campaign');
    await click(page, '.levels-continue');
    await page.waitForFunction(() => window.__game?.session);
    const back = await page.evaluate(() => ({ moves: window.__game.session.moves, rots: window.__game.session.board.cells.map((c) => c.rot).join(''), toast: !!document.querySelector('.toast.show') }));
    if (back.moves !== 3 || back.rots !== rots || !back.toast) note('離開再回來沒有接回進度：' + JSON.stringify(back));
    await page.waitForFunction(() => !window.__game.counting && !window.__game.session.paused, null, { timeout: 40000 });
  }
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
  await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  // 重來的確認：轉了 5 下以上按「重來」要先問；取消後進度與計時照舊，確定才歸零
  {
    await page.evaluate(() => {
      const g = window.__game;
      const k = g.session.board.cells.findIndex((c) => !c.locked && c.mask !== 15);
      for (let i = 0; i < 8; i++) g.doTap(k);
    });
    await page.locator('.bar .btn').nth(2).click();
    await page.waitForSelector('.modal-confirm');
    await audit(page, 'flow-confirm');
    if (!(await page.evaluate(() => window.__game.session.paused))) note('確認重來時計時沒有暫停');
    await page.keyboard.press('Escape');
    const kept = await page.evaluate(() => ({ moves: window.__game.session.moves, paused: window.__game.session.paused }));
    if (kept.moves !== 8 || kept.paused) note('取消重來後進度或計時不對：' + JSON.stringify(kept));
    await page.locator('.bar .btn').nth(2).click();
    await page.locator('[data-act="confirm-restart"]').click();
    await page.waitForFunction(() => window.__game.session.moves === 0 && window.__game.counting);
    await page.waitForFunction(() => !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  }
  // 即時星星：開局三顆，用了提示就少一顆；點鎖住的水管會晃動且不算步數
  const starsOn = () => page.locator('.hud-stars .ico.on').count();
  if ((await starsOn()) !== 3) note('開局的即時星星應該是三顆');
  await page.keyboard.press('h');
  await settle(page, 400);
  if ((await starsOn()) !== 2) note('用了提示後即時星星應該剩兩顆');
  const lockedShake = await page.evaluate(() => {
    const g = window.__game;
    const k = g.session.board.cells.findIndex((c) => c.locked);
    const before = g.session.moves;
    g.doTap(k);
    return { shaking: g.scene.cells[k].shakeT0 >= 0, same: g.session.moves === before };
  });
  if (!lockedShake.shaking || !lockedShake.same) note('點鎖住的水管應該晃動且不算步數：' + JSON.stringify(lockedShake));
  await context.close();
}

/* ---------- 1b. 系統開了「減少動態效果」的新玩家，預設就要減少動態 ---------- */
if (!skipFlow) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(URL_);
  await page.waitForSelector('#app[data-ready]');
  if (!(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')))) note('系統要求減少動態時，新玩家沒有預設開啟減少動態');
  await context.close();
}

/* ---------- 1d. 真的用觸控事件：點一下旋轉、兩指縮放與平移、放大後單指平移，手勢結束不會誤轉水管 ---------- */
if (!skipFlow) {
  console.log('觸控檢查');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => note('觸控：頁面錯誤 ' + e.message));
  await page.addInitScript(() => {
    window.__PIPE_TEST__ = true;
    localStorage.setItem('pipe-connect.v1', JSON.stringify({ settings: { music: false, sfx: false, vibrate: false } }));
  });
  await page.goto(URL_);
  await page.waitForSelector('#app[data-ready]');
  await page.locator('.mode-random').tap();
  await page.locator('.diff-card').nth(2).tap();
  await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  await settle(page, 600);
  const cdp = await context.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const state = () => page.evaluate(() => ({ moves: window.__game.session.moves, zoom: window.__game.scene.view.zoom, panX: window.__game.scene.view.panX, panZ: window.__game.scene.view.panZ, az: window.__game.scene.view.az }));
  // 找一節可以轉的水管，算出它在螢幕上的位置
  const target = await page.evaluate(() => {
    const g = window.__game, sc = g.scene;
    const i = g.session.board.cells.findIndex((c) => !c.locked && c.mask !== 15);
    const rect = sc.renderer.domElement.getBoundingClientRect();
    const p = sc._cellPos(i);
    const v = sc.camera.position.clone().set(p.x, 0.3, p.z).project(sc.camera);
    return { i, x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  });
  await page.touchscreen.tap(target.x, target.y);
  let st = await state();
  if (st.moves !== 1) note('觸控點一下沒有剛好轉一次：' + JSON.stringify(st));
  const rot1 = await page.evaluate((i) => window.__game.session.board.cells[i].rot, target.i);
  // 兩指張開放大
  const box = await page.locator('.stage').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let d = 40; d <= 110; d += 14) await touch('touchMove', [[cx - d, cy], [cx + d, cy]]);
  await touch('touchEnd', []);
  await settle(page, 150);
  st = await state();
  if (!(st.zoom > 1.5)) note('兩指張開沒有放大：' + JSON.stringify(st));
  if (st.moves !== 1) note('兩指縮放結束時誤轉了水管：' + JSON.stringify(st));
  // 兩指一起往右移＝平移
  const pan0 = st.panX;
  await touch('touchStart', [[cx - 50, cy], [cx + 50, cy]]);
  for (let dx = 10; dx <= 60; dx += 10) await touch('touchMove', [[cx - 50 + dx, cy], [cx + 50 + dx, cy]]);
  await touch('touchEnd', []);
  await settle(page, 150);
  st = await state();
  if (st.panX === pan0) note('兩指平移沒有作用：' + JSON.stringify(st));
  if (st.moves !== 1) note('兩指平移結束時誤轉了水管');
  // 放大後單指拖曳＝平移（不是轉視角）
  const pan1 = st.panX;
  await touch('touchStart', [[cx, cy]]);
  for (let dx = 8; dx <= 56; dx += 8) await touch('touchMove', [[cx - dx, cy]]);
  await touch('touchEnd', []);
  await settle(page, 150);
  st = await state();
  if (st.panX === pan1 || st.az !== 0) note('放大後單指拖曳應該平移：' + JSON.stringify(st));
  if (st.moves !== 1) note('單指拖曳結束時誤轉了水管');
  // 放大、平移之後再點同一節水管，還是要點得到它
  const again = await page.evaluate((i) => {
    const sc = window.__game.scene;
    const rect = sc.renderer.domElement.getBoundingClientRect();
    const p = sc._cellPos(i);
    const v = sc.camera.position.clone().set(p.x, 0.3, p.z).project(sc.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, w: innerWidth, top: rect.top, bottom: rect.bottom };
  }, target.i);
  if (again.x > 4 && again.x < again.w - 4 && again.y > again.top + 4 && again.y < again.bottom - 4) {
    await page.touchscreen.tap(again.x, again.y);
    const rot2 = await page.evaluate((i) => window.__game.session.board.cells[i].rot, target.i);
    if (rot2 !== ((rot1 + 1) & 3)) note('放大平移後點水管沒有轉到同一節');
  }
  // 視角復位鈕、操作鈕用觸控也要有反應
  await page.locator('.zoom .icon-btn').nth(2).tap();
  st = await state();
  if (st.zoom !== 1 || st.panX !== 0) note('觸控按視角復位沒有還原');
  await page.locator('.bar .btn').nth(0).tap();
  if ((await page.evaluate(() => window.__game.session.undoStack.length)) >= (await page.evaluate(() => window.__game.session.moves))) note('觸控按復原沒有作用');
  await context.close();
}

/* ---------- 1c. WebGL 被系統收走再還回來；以及完全沒有 WebGL 的裝置 ---------- */
if (!skipFlow) {
  console.log('WebGL 檢查');
  {
    const { context, page } = await open(820, 1180, 'zh-Hant');
    await click(page, '.mode-random');
    await page.locator('.diff-card').nth(2).click();
    await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
    const lost = await page.evaluate(async () => {
      const g = window.__game;
      const k = g.session.board.cells.findIndex((c) => !c.locked && c.mask !== 15);
      g.doTap(k);
      const ext = g.scene.renderer.getContext().getExtension('WEBGL_lose_context');
      if (!ext) return { skipped: true };
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 300));
      const wasLost = g.scene.lost === true;
      ext.restoreContext();
      await new Promise((r) => setTimeout(r, 600));
      g.doTap(k);
      const pick = g.scene.probePick();
      return { wasLost, back: g.scene.lost === false, moves: g.session.moves, cells: g.scene.cells.length, pickBad: pick.tile + pick.pipeTop + pick.armEnd };
    });
    if (!lost.skipped && (!lost.wasLost || !lost.back || lost.moves !== 2 || !lost.cells || lost.pickBad)) note('WebGL 還回來後畫面沒有復原：' + JSON.stringify(lost));
    await context.close();
  }
  {
    const noGl = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--disable-gpu', '--disable-3d-apis'] });
    const context = await noGl.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => note('沒有 WebGL 時頁面錯誤：' + e.message));
    await page.addInitScript(() => localStorage.setItem('pipe-connect.v1', JSON.stringify({ settings: { music: false, sfx: false } })));
    await page.goto(URL_);
    await page.waitForSelector('#app[data-ready]');
    await click(page, '.mode-campaign');
    await click(page, '.levels-continue');
    await page.waitForSelector('.stage-error', { timeout: 5000 }).catch(() => note('沒有 WebGL 時沒有顯示說明'));
    await audit(page, 'flow-no-webgl');
    await page.keyboard.press('Escape');
    await click(page, '#btn-settings');
    await page.waitForSelector('.modal-settings').catch(() => note('沒有 WebGL 的畫面上設定打不開'));
    await page.keyboard.press('Escape');
    await page.locator('.stage-error .btn').click();
    await page.waitForSelector('.levels-continue', { timeout: 4000 }).catch(() => note('沒有 WebGL 的說明畫面回不去選關'));
    await noGl.close();
  }
}

/* ---------- 2. 各尺寸 × 語言的版面檢查 ---------- */
console.log('版面檢查');
const seeded = { progress: { camp: { tot: { stars: [3, 3, 2, 1, 3] }, easy: { stars: [3, 2] } }, daily: {}, stats: { clears: 7, taps: 120, seconds: 432, hints: 3, perfect: 2, maxStreak: 2 }, ach: { first: 1 } } };
for (const [name, vw, vh] of VIEWPORTS) {
  if (only ? !only.split(',').includes(name) : name.startsWith('x-')) continue;
  for (const lang of LANGS) {
    if (lang === 'zh-Hans' && name !== 'phone-portrait') continue; // 簡中字寬與繁中相同，抽一個尺寸確認
    const { context, page } = await open(vw, vh, lang, seeded);
    const tag = (s) => `${name}-${lang}-${s}`;
    await settle(page, 900);
    await audit(page, tag('home'));
    {
      // 首頁不用捲就要看得到三個模式與兩顆次要按鈕（最小的 320×568 例外，允許捲動）
      const below = await page.evaluate(() => [...document.querySelectorAll('.home .mode-card, .home-more .btn')].filter((e) => e.getBoundingClientRect().bottom > innerHeight + 1).length);
      if (below && name !== 'phone-small' && name !== 'x-tiny') note(tag('home') + `：首頁有 ${below} 個入口要捲動才看得到`);
    }
    await click(page, '.mode-campaign');
    await settle(page);
    await audit(page, tag('levels'));
    await page.locator('.level').nth(1).click();
    await page.waitForFunction(() => window.__game?.session);
    await settle(page, 350);
    await audit(page, tag('countdown'));
    await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
    await settle(page, 900);
    await audit(page, tag('game'));
    {
      // 盤面要完整在畫面內，而且在較緊的那個方向至少佔 80%，不能縮成一小塊
      const m = await page.evaluate(() => window.__game.scene.measure());
      if (!m.inside || Math.max(m.fillX, m.fillY) < 0.8) note(tag('game') + '：盤面沒有放到最大或超出畫面 ' + JSON.stringify(m));
      // 點擊準確度：地磚中心、水管頂端、開口靠邊的位置、水塔頂端都要選到自己這一格；
      // 視角轉到最斜時前排水塔會擋住後排地磚（看到什麼點到什麼），所以最斜時不檢查地磚中心
      const pick = await page.evaluate(() => {
        const sc = window.__game.scene;
        const flat = sc.probePick();
        Object.assign(sc.view, { polar: 1.05, az: 0.9 });
        sc._placeCamera();
        const tilted = sc.probePick();
        sc.resetView();
        return { flat, tilted };
      });
      // 最斜時，緊貼在水塔後面的開口也會被水塔擋住，每個水塔最多擋兩個
      const sources = await page.evaluate(() => window.__game.session.board.colors);
      const bad = pick.flat.tile + pick.flat.pipeTop + pick.flat.armEnd + pick.flat.sourceTop + pick.tilted.pipeTop + pick.tilted.sourceTop + Math.max(0, pick.tilted.armEnd - sources * 2);
      if (bad) note(tag('game') + '：點水管會選到別格 ' + JSON.stringify(pick));
    }
    await page.goBack();
    await page.goBack();
    await click(page, '.mode-daily');
    await settle(page);
    await audit(page, tag('daily'));
    // 最大的盤面：神話、邊緣相通、多色
    await page.locator('.diff-card').nth(4).click();
    await page.waitForFunction(() => window.__game?.session);
    await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
    await settle(page, 600);
    await audit(page, tag('game-myth'));
    {
      // 盤面要完整在畫面內，而且在較緊的那個方向至少佔 80%，不能縮成一小塊
      const m = await page.evaluate(() => window.__game.scene.measure());
      if (!m.inside || Math.max(m.fillX, m.fillY) < 0.8) note(tag('game-myth') + '：盤面沒有放到最大或超出畫面 ' + JSON.stringify(m));
      // 點擊準確度：地磚中心、水管頂端、開口靠邊的位置、水塔頂端都要選到自己這一格；
      // 視角轉到最斜時前排水塔會擋住後排地磚（看到什麼點到什麼），所以最斜時不檢查地磚中心
      const pick = await page.evaluate(() => {
        const sc = window.__game.scene;
        const flat = sc.probePick();
        Object.assign(sc.view, { polar: 1.05, az: 0.9 });
        sc._placeCamera();
        const tilted = sc.probePick();
        sc.resetView();
        return { flat, tilted };
      });
      // 最斜時，緊貼在水塔後面的開口也會被水塔擋住，每個水塔最多擋兩個
      const sources = await page.evaluate(() => window.__game.session.board.colors);
      const bad = pick.flat.tile + pick.flat.pipeTop + pick.flat.armEnd + pick.flat.sourceTop + pick.tilted.pipeTop + pick.tilted.sourceTop + Math.max(0, pick.tilted.armEnd - sources * 2);
      if (bad) note(tag('game-myth') + '：點水管會選到別格 ' + JSON.stringify(pick));
    }
    await page.evaluate(() => {
      const g = window.__game;
      for (let i = 0; i < 600 && !g.session.done; i++) {
        const k = g.session.board.cells.findIndex((c) => !c.locked && c.rot % (c.mask === 15 ? 1 : c.mask === 5 || c.mask === 10 ? 2 : 4) !== 0);
        if (k < 0) break;
        g.doTap(k);
      }
    });
    await page.waitForSelector('.modal-result', { timeout: 20000 });
    await settle(page, 900);
    await audit(page, tag('result'));
    if (!(await page.locator('.modal-result [data-act="next-daily"]').count())) note(tag('result') + '：每日挑戰結算沒有「下一題」');
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

/* ---------- 2b. 無障礙掃描（axe-core；設定 AXE_PATH 指到 axe.min.js 才會跑）---------- */
if (process.env.AXE_PATH && !skipFlow) {
  console.log('無障礙掃描');
  const axeSource = fs.readFileSync(process.env.AXE_PATH, 'utf8');
  const { context, page } = await open(1180, 820, 'zh-Hant', seeded);
  const scan = async (label) => {
    await page.evaluate(axeSource);
    const found = await page.evaluate(async () => {
      // 只掃目前最上層看得到的東西；canvas 是 3D 畫面，另外用鍵盤與朗讀區提供替代操作
      const top = document.querySelector('.result-share-dialog-layer:not([hidden])') || document.querySelector('#overlays .modal-backdrop:last-of-type') || document.body;
      const r = await window.axe.run(top, { resultTypes: ['violations'] });
      return r.violations.map((v) => `${v.id}（${v.impact}）×${v.nodes.length}：${v.nodes[0].target.join(' ')}`);
    });
    found.forEach((f) => note(`無障礙 ${label}：${f}`));
  };
  await settle(page, 900);
  await scan('首頁');
  await click(page, '.mode-campaign');
  await settle(page);
  await scan('選關');
  await click(page, '.levels-continue');
  await page.waitForFunction(() => window.__game?.session && !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  await settle(page, 900);
  await scan('遊戲');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-menu');
  await scan('暫停');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 600 && !g.session.done; i++) {
      const k = g.session.board.cells.findIndex((c) => !c.locked && c.rot % (c.mask === 15 ? 1 : c.mask === 5 || c.mask === 10 ? 2 : 4) !== 0);
      if (k < 0) break;
      g.doTap(k);
    }
  });
  await page.waitForSelector('.modal-result', { timeout: 20000 });
  await settle(page, 900);
  await scan('結算');
  await page.locator('.modal-result .modal-foot .btn').last().click();
  await page.waitForSelector('.home');
  for (const [sel, label] of [['.mode-daily', '每日挑戰'], ['.mode-random', '隨機']]) {
    await click(page, sel);
    await settle(page);
    await scan(label);
    await page.goBack();
  }
  for (const [n, label] of [[0, '玩法說明'], [1, '成就與統計']]) {
    await page.locator('.home-more .btn').nth(n).click();
    await settle(page);
    await scan(label);
    await page.goBack();
  }
  await click(page, '#btn-settings');
  await settle(page);
  await scan('設定');
  await page.keyboard.press('Escape');
  await click(page, '#btn-lang');
  await settle(page, 200);
  await scan('語言選單');
  await context.close();
}

/* ---------- 3. 加長文字：每段英文再加長四成，模擬更長的語言，最容易破版的三種尺寸都要撐得住 ---------- */
console.log('加長文字檢查');
for (const [name, vw, vh] of VIEWPORTS) {
  if (!['phone-small', 'phone-landscape', 'tablet-portrait'].includes(name)) continue;
  if (only && !only.split(',').includes(name)) continue;
  const { context, page } = await open(vw, vh, 'en', seeded, true);
  const tag = (x) => `${name}-long-${x}`;
  await settle(page, 900);
  await audit(page, tag('home'));
  await click(page, '.mode-campaign');
  await settle(page);
  await audit(page, tag('levels'));
  await click(page, '.levels-continue');
  await page.waitForFunction(() => window.__game?.session);
  await settle(page, 400);
  await audit(page, tag('countdown'));
  await page.waitForFunction(() => !window.__game.counting && window.__game.session.started, null, { timeout: 40000 });
  await settle(page, 900);
  await audit(page, tag('game'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-menu');
  await audit(page, tag('pause'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 600 && !g.session.done; i++) {
      const k = g.session.board.cells.findIndex((c) => !c.locked && c.rot % (c.mask === 15 ? 1 : c.mask === 5 || c.mask === 10 ? 2 : 4) !== 0);
      if (k < 0) break;
      g.doTap(k);
    }
  });
  await page.waitForSelector('.modal-result', { timeout: 20000 });
  await settle(page, 900);
  await audit(page, tag('result'));
  await page.locator('.modal-result .modal-foot .btn').last().click();
  await page.waitForSelector('.home');
  for (const [sel, key] of [['.mode-daily', 'daily'], ['.mode-random', 'random']]) {
    await click(page, sel);
    await settle(page);
    await audit(page, tag(key));
    await page.goBack();
  }
  await page.locator('.home-more .btn').nth(1).click();
  await settle(page);
  await audit(page, tag('stats'));
  await click(page, '#btn-settings');
  await settle(page);
  await audit(page, tag('settings'));
  await context.close();
  console.log(`  ${name} 加長文字完成`);
}

await browser.close();
server.close();
if (problems.length) {
  console.log(`\n瀏覽器檢查發現 ${problems.length} 個問題`);
  process.exit(1);
}
console.log('\n瀏覽器檢查全部通過');
