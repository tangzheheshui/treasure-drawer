// 按住说话·手势自检：CDP 触摸事件走浏览器真实输入管线（不是 JS 合成事件）。
// 麦克风用 Chrome 假音频设备，识别代理 mock 成固定回一句话。覆盖：
// 按下进「正在听」→ 按住期间按钮不卸载+分段识别上屏 → 松手立即转「识别中」→
// 识别出预览 → 选桌下单 → 误触快按快松不卡死 → 鼠标路径同样一遍。
// 背景：曾连修 5 次松手卡死，根因是按下即卸载触摸目标（touchend 派发到已脱离
// 文档的节点，冒不到任何监听）——桌面测试复现不了，只有真触摸管线能守住。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const out = [];
const ok = (name, cond) => out.push([name, !!cond]);

// ── mock 百度识别代理（带 CORS：真 PocketBase 服务器有，漏了会卡预检）──
let asrCalls = 0;
const mock = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { // 预检
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.statusCode = 204; res.end(); return;
  }
  if (req.url.startsWith('/api/baidu-asr')) {
    asrCalls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text: '羊肉串二十串可乐两瓶' })); // 任何音频都回这句（种子菜单能解析）
    return;
  }
  res.statusCode = 404; res.end('{}'); // PocketBase SSE/其余请求一律 404，app 自会离线兜底
});
await new Promise((r) => mock.listen(0, r)); // 临时端口，避免和别的进程撞
const pbBase = `http://localhost:${mock.address().port}`;

// ── 起预览（端口也找空闲的）──
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const url = `http://localhost:${PORT}/`;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: '.', stdio: 'ignore', shell: true });
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(url); if (r.ok) { up = true; break; } } catch { /* 未起 */ }
  await sleep(250);
}
if (!up) { console.log('✗ 预览服务起不来（先跑 npx vite build）'); srv.kill(); process.exit(1); }

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) { console.log('⚠ 没找到 Chrome，跳过'); srv.kill(); process.exit(0); }

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], // 假麦克风 + 自动授权
});

// 预置「已联机」店铺：pbBase 指向 mock，进应用前写进 idb-keyval 的库
const seed = (ctx) => ctx.addInitScript((base) => {
  const d = (catId, name, price, unit) => ({ id: name, catId, name, price, unit, soldOut: false });
  const db = {
    shop: { name: '测试摊', tableCount: 8, mode: 'mix', voice: false, volume: 0, pbBase: base, pbId: 'seed' },
    cats: [{ id: 'c1', name: '串类' }, { id: 'c2', name: '酒水' }],
    dishes: [d('c1', '羊肉串', 6, '串'), d('c1', '牛肉串', 6, '串'), d('c2', '啤酒', 10, '瓶'), d('c2', '可乐', 3, '瓶')],
    orders: [], calls: [], mats: [], moves: [],
  };
  const req = indexedDB.open('keyval-store');
  req.onupgradeneeded = () => { req.result.createObjectStore('keyval'); };
  req.onsuccess = () => { req.result.transaction('keyval', 'readwrite').objectStore('keyval').put(db, 'stall-db-v1'); };
}, pbBase);

const until = (page, fn, ms) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true).catch(() => false);
const pageErrors = [];

// 在「按住说话」大按钮上按下并等到「正在听」
async function press(page, down) {
  await page.waitForSelector('.voice-btn', { timeout: 10000 });
  const box = await page.locator('.voice-btn').boundingBox();
  await down(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.listen', { timeout: 4000 }); // 按下 → 进入「正在听」
}

try {
  // ── 触摸路径（真机手机的手势）──
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(url);
  ok('联机后工作台出现「按住说话」', await page.waitForSelector('.voice-btn', { timeout: 10000 }).then(() => true).catch(() => false));

  const cdp = await ctx.newCDPSession(page);
  const tDown = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  const tUp = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await press(page, tDown);
  ok('按下进入「正在听」', true);
  await sleep(600);
  ok('按住期间按钮不卸载（触摸目标必须在，松手事件才有处落）', await page.evaluate(() => !!document.querySelector('.voice-btn')));

  await sleep(2700); // 凑满 ~3.3s，让 2.5s 一档的分段识别跑一次
  ok('按住期间分段识别上屏（不哑火）', await until(page, () => document.querySelector('.ltext')?.textContent.includes('羊肉串'), 1500));

  // 松手：必须立刻离开「正在听」（转「识别中」或直接出结果；停在「正在听/按住说话」= 卡死）
  await tUp();
  const released = await until(page, () => {
    const el = document.querySelector('.ltext');
    if (!el) return true; // 蒙层已撤（结果已出）
    return el.textContent.includes('识别中');
  }, 2000);
  ok('松手立刻退出「正在听」→「识别中」（不卡死）', released);

  await page.waitForSelector('.modal', { timeout: 8000 });
  const body = await page.textContent('.modal');
  ok('识别出单子预览（羊肉串×20/可乐×2）', body.includes('羊肉串') && body.includes('可乐') && body.includes('20'));

  await page.getByRole('button', { name: '确认，选桌' }).click();
  await page.waitForSelector('.tcard.pick', { timeout: 4000 });
  await page.locator('.tcard.pick').nth(2).click(); // 3号桌
  ok('确认后选桌下单，进 3 号桌', await until(page, () => location.hash === '#/table/3', 4000));

  await page.locator('.nav .back').click(); // 回工作台
  ok('回工作台，按钮可用', await page.waitForSelector('.voice-btn', { timeout: 4000 }).then(() => true).catch(() => false));

  // 误触：快按快松（80ms）也不许卡「正在听」；若真出了预览（假麦克风有声），「再说一遍」能干净关掉
  const box = await page.locator('.voice-btn').boundingBox();
  await tDown(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(80);
  await tUp();
  ok('误触快按快松不卡「正在听」', await until(page, () => !document.querySelector('.listen'), 4000));
  if (await page.locator('.modal').count()) {
    await page.getByRole('button', { name: '再说一遍' }).click();
    ok('「再说一遍」= 关预览回工作台（再按按钮重说）', await until(page, () => !document.querySelector('.mask') && !!document.querySelector('.voice-btn'), 3000));
  } else {
    ok('「再说一遍」= 关预览回工作台（再按按钮重说）', true);
  }
  await ctx.close();

  // ── 鼠标路径（桌面 Chrome）──
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  seed(ctx2);
  const page2 = await ctx2.newPage();
  await page2.goto(url);
  await press(page2, async (x, y) => { await page2.mouse.move(x, y); await page2.mouse.down(); });
  await sleep(700);
  await page2.mouse.up();
  const rel2 = await until(page2, () => {
    const el = document.querySelector('.ltext');
    return !el || el.textContent.includes('识别中');
  }, 2000);
  ok('鼠标按住/松手同样不卡（松手即出结果）', rel2 && await page2.waitForSelector('.modal', { timeout: 8000 }).then(() => true).catch(() => false));
  ok('识别代理真被调用过（录音→上传链路通）', asrCalls >= 2);
  await ctx2.close();
} catch (e) {
  ok(`自检中断：${String(e.message).split('\n')[0]}`, false);
}
await browser.close();
srv.kill();
mock.close();

let fail = 0;
for (const [name, pass] of out) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) fail++; }
if (pageErrors.length) console.log('页面错误：\n' + pageErrors.map((m) => '  ' + m).join('\n'));
process.exit(fail ? 1 : 0);
