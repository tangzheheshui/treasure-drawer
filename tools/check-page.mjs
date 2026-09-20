// 共享无头自检：起 vite preview → 真 Chrome 打开 → 等元素 → 点一下 → 等结果。
// 用法: node check-page.mjs <工具目录> <端口> <必现元素> [点击元素] [点击后元素] [超时ms]
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const [dir, port, waitSel, clickSel, finalSel, timeoutMs] = process.argv.slice(2);
const url = `http://localhost:${port}/`;

const srv = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: dir, stdio: 'ignore' });
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
  await page.waitForSelector(waitSel, { timeout: 10000 });
  ok(`页面加载，出现「${waitSel}」`, true);
  ok('加载无脚本错误', errors.length === 0);
  if (clickSel) {
    await page.click(clickSel);
    await page.waitForSelector(finalSel, { timeout: Number(timeoutMs) || 10000 });
    ok(`点「${clickSel}」后出现「${finalSel}」`, true);
    ok('交互后无脚本错误', errors.length === 0);
  }
} catch (e) {
  ok(`自检中断：${String(e.message).split('\n')[0]}`, false);
}
await browser.close();
srv.kill();

let fail = 0;
for (const [name, pass] of out) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) fail++; }
if (errors.length) console.log('页面错误：\n' + errors.map((e) => '  ' + e).join('\n'));
process.exit(fail ? 1 : 0);
