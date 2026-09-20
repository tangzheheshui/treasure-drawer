// 骰子专用无头自检：起 vite preview → 真 Chrome：摇 → 盖住不报点 → 上划开盅报点 → 下划盖回收回 → 加骰。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const url = 'http://localhost:5288/';
const srv = spawn('npx', ['vite', 'preview', '--port', '5288', '--strictPort'], { cwd: '.', stdio: 'ignore' });
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(url); if (r.ok) { up = true; break; } } catch { /* 未起 */ }
  await sleep(250);
}
if (!up) { console.log('✗ 预览服务起不来'); srv.kill(); process.exit(1); }

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const out = [];
const ok = (name, cond) => out.push([name, !!cond]);
try {
  await page.goto(url);
  await page.waitForSelector('canvas', { timeout: 10000 });
  ok('页面加载，出现 3D 画布', true);
  ok('加载无脚本错误', errors.length === 0);

  await page.click('.roll');
  await page.waitForSelector('.hint', { timeout: 16000 });
  ok('摇完先盖着（提示上划开盅）', (await page.textContent('.hint')).includes('上划'));
  ok('盖着时不报点数', (await page.locator('.total.on').count()) === 0);

  const box = await (await page.$('canvas')).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 260, { steps: 10 });
  await page.mouse.up();
  await page.waitForSelector('.total.on', { timeout: 5000 });
  ok('上划开盅后报点数', true);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 260, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('.total')?.classList.contains('on'), null, { timeout: 5000 });
  ok('下划盖上后收起点数', true);

  await page.locator('.stepper button').nth(1).click();
  await page.waitForFunction(() => document.querySelector('.stepper b')?.textContent === '6', null, { timeout: 3000 });
  ok('加减骰子可用（5→6）', true);
  ok('全程无脚本错误', errors.length === 0);
} catch (e) {
  ok(`自检中断：${String(e.message).split('\n')[0]}`, false);
}
await browser.close();
srv.kill();

let fail = 0;
for (const [name, pass] of out) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) fail++; }
if (errors.length) console.log('页面错误：\n' + errors.map((m) => '  ' + m).join('\n'));
process.exit(fail ? 1 : 0);
