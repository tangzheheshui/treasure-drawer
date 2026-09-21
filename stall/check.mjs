// 摊主端无头自检：开台点单 → 出餐叫号 → 清台 → 统计归档，全链路一遍。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const url = 'http://localhost:5198/';
const srv = spawn('npx', ['vite', 'preview', '--port', '5198', '--strictPort'], { cwd: '.', stdio: 'ignore' });
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
  await page.waitForSelector('.tcard', { timeout: 10000 });
  ok('首页出现桌号卡片', true);
  ok('加载无脚本错误', errors.length === 0);

  await page.locator('.tcard.idle').first().click();          // 1号桌开台
  await page.waitForSelector('.cartbar', { timeout: 5000 });
  ok('点空闲桌进入点单页', true);
  await page.locator('.row .sqbtn').first().click();          // 加第一道菜
  await page.locator('.row .sqbtn').nth(2).click();           // 加第二道菜
  await page.locator('.cartbar .btn.primary').click();        // 提交下单
  await page.waitForSelector('.tcard.dining', { timeout: 5000 });
  ok('提交后桌号变「用餐中」', true);

  await page.locator('.tcard.dining').first().click();        // 进订单详情
  await page.waitForSelector('.btn.warn', { timeout: 5000 });
  ok('订单详情显示菜品与总价', (await page.locator('.row').count()) >= 2);
  await page.locator('.mini.ok').click();                     // 一键全出 → 叫号
  await page.waitForSelector('.pill.served', { timeout: 5000 });
  ok('全部出餐后标记「已出餐」', true);
  await page.locator('.btn.warn').click();                    // 结账并清台
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal .btn.warn').click();             // 二次确认
  await page.waitForSelector('.tcard.idle', { timeout: 5000 });
  ok('清台后桌号回到「空闲」', true);

  await page.locator('.tabbar button').nth(2).click();        // 统计
  await page.waitForFunction(() => document.body.textContent.includes('今日'), { timeout: 5000 });
  ok('今日统计出现归档订单', (await page.locator('.card').count()) >= 1);

  await page.goto(`${url}customer.html`);                     // 顾客页：无二维码参数时的友好提示
  await page.waitForFunction(() => document.body.textContent.includes('二维码'), { timeout: 5000 });
  ok('顾客 H5 无参数时给出引导文案', true);
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
