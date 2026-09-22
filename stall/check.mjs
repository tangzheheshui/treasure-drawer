// 摊主端无头自检：开台点单 → 出餐叫号 → 清台 → 统计归档，全链路一遍。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { parseOrderTranscript } from './src/parseOrder.js';

// ── 语音解析：纯函数直接在 Node 里断言（真机语音识别没法无头测，先锁死解析逻辑）──
const out = [];
const ok = (name, cond) => out.push([name, !!cond]);
const MENU = [
  { id: 'yrc', name: '羊肉串', price: 6, soldOut: false, specs: [{ name: '辣度', opts: [{ n: '微辣', d: 0 }, { n: '中辣', d: 0 }, { n: '特辣', d: 0 }] }] },
  { id: 'nrc', name: '牛肉串', price: 6, soldOut: false },
  { id: 'kmj', name: '烤面筋', price: 3, soldOut: false, specs: [{ name: '份量', opts: [{ n: '大份', d: 4 }] }] },
  { id: 'pj', name: '啤酒', price: 10, soldOut: false },
  { id: 'kl', name: '可乐', price: 3, soldOut: false },
  { id: 'kys', name: '矿泉水', price: 2, soldOut: false },
  { id: 'cf', name: '炒粉', price: 10, soldOut: false },
  { id: 'phg', name: '拍黄瓜', price: 8, soldOut: true }, // 售罄不参与
].map((d) => ({ ...d }));
const P = (t) => parseOrderTranscript(t, MENU);
const pick = (r, name) => r.items.find((i) => i.name === name);
{
  let r = P('羊肉串来二十串可乐两瓶');
  ok('解析：菜名后数量（羊肉串20/可乐2）', pick(r, '羊肉串')?.qty === 20 && pick(r, '可乐')?.qty === 2 && r.items.length === 2);
  r = P('先来十串羊肉串再来五串面筋');
  ok('解析：数量在前后都行（羊肉串10）', pick(r, '羊肉串')?.qty === 10);
  ok('解析：错字模糊认出（面筋→烤面筋，标「认成了？」）', pick(r, '烤面筋')?.qty === 5 && pick(r, '烤面筋')?.fuzzy === true);
  r = P('羊肉串十串牛肉串五串');
  ok('解析：两菜各配各的数（10/5）', pick(r, '羊肉串')?.qty === 10 && pick(r, '牛肉串')?.qty === 5);
  r = P('给我羊肉串可乐');
  ok('解析：没说数量默认 1 份', pick(r, '羊肉串')?.qty === 1 && pick(r, '可乐')?.qty === 1);
  r = P('羊肉串一百串');
  ok('解析：中文数字百位（一百=100）', pick(r, '羊肉串')?.qty === 100);
  r = P('羊肉串二十串拍黄瓜');
  ok('解析：售罄的菜不认', pick(r, '羊肉串')?.qty === 20 && !pick(r, '拍黄瓜') && r.leftover.includes('黄瓜'));
  r = P('随便说点别的');
  ok('解析：全没对上时出空单子', r.items.length === 0 && r.leftover.length > 0);
  r = P('二十三串羊肉串两瓶啤酒');
  ok('解析：二十三=23、啤酒两瓶', pick(r, '羊肉串')?.qty === 23 && pick(r, '啤酒')?.qty === 2);
  r = P('羊肉串二十串中辣可乐两瓶');
  ok('解析：规格中辣跟在菜名后（羊肉串/中辣）', pick(r, '羊肉串')?.qty === 20 && pick(r, '羊肉串')?.spec === '中辣' && pick(r, '可乐')?.qty === 2);
  r = P('羊肉串中辣十串');
  ok('解析：规格在数量前（羊肉串/中辣/10）', pick(r, '羊肉串')?.qty === 10 && pick(r, '羊肉串')?.spec === '中辣');
  r = P('烤面筋大份五串');
  ok('解析：份量规格（大份）', pick(r, '烤面筋')?.qty === 5 && pick(r, '烤面筋')?.spec === '大份');
  r = P('羊肉串微辣牛肉串特辣');
  ok('解析：两菜各带各自规格（微辣/特辣不串）', pick(r, '羊肉串')?.spec === '微辣' && pick(r, '牛肉串')?.spec === undefined);
}

const url = 'http://localhost:5198/';
const srv = spawn('npx', ['vite', 'preview', '--port', '5198', '--strictPort'], { cwd: '.', stdio: 'ignore', shell: true }); // Windows 下 npx 是 .cmd，得走 shell
let up = false;
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(url); if (r.ok) { up = true; break; } } catch { /* 未起 */ }
  await sleep(250);
}
if (!up) { console.log('✗ 预览服务起不来'); srv.kill(); process.exit(1); }

// 浏览器按平台找（Chrome 优先，Edge 同为 Chromium 可顶上），找不到就只保留 Node 侧的解析断言
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) {
  srv.kill();
  console.log('⚠ 没找到 Chrome，跳过页面自检（语音解析断言已跑）');
  let fail = 0;
  for (const [name, pass] of out) { console.log(`${pass ? '✓' : '✗'} ${name}`); if (!pass) fail++; }
  process.exit(fail ? 1 : 0);
}
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

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
  ok('订单按「笔」分组（第1笔）', (await page.textContent('.page')).includes('第1笔'));
  await page.getByRole('button', { name: '标记结账' }).click(); // 本笔标记结账
  await page.waitForSelector('.bdone', { timeout: 5000 });
  ok('单笔标记结账生效', true);
  await page.getByRole('button', { name: '取消标记' }).click();
  await page.waitForFunction(() => !document.querySelector('.bdone'), null, { timeout: 5000 });
  ok('取消标记可撤回', true);
  await page.getByRole('button', { name: '一键全出' }).click(); // 一键全出 → 叫号
  await page.waitForSelector('.pill.served', { timeout: 5000 });
  ok('全部出餐后标记「已出餐」', true);
  await page.locator('.btn.warn').click();                    // 结账并清台
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal .btn.warn').click();             // 二次确认 → 小票页
  await page.waitForSelector('.receipt', { timeout: 5000 });
  ok('清台后进小票页（可打印）', (await page.textContent('.receipt')).includes('合计'));
  ok('小票含打印按钮', (await page.locator('.btn.primary').count()) >= 1);
  await page.locator('.nav .back').click();                   // 完成 → 回桌台
  await page.waitForSelector('.tcard.idle', { timeout: 5000 });
  ok('清台后桌号回到「空闲」', true);

  await page.locator('.nav .act.ghost').click();               // 经营层 → 后台
  await page.waitForSelector('.adminbar', { timeout: 5000 });
  ok('后台底栏出现（4 个分区）', (await page.locator('.adminbar button').count()) >= 4);
  ok('经营态没有底部页签', (await page.locator('.tabbar').count()) === 0);
  await page.locator('.adminbar button', { hasText: '统计' }).click();
  await page.waitForFunction(() => document.body.textContent.includes('订单数1'), { timeout: 5000 });
  const statText = await page.textContent('.page');
  ok('概览随时间段（订单数/客单价/毛利率）', statText.includes('订单数1') && statText.includes('客单价') && statText.includes('毛利率'));
  ok('趋势折线图渲染', (await page.locator('svg path').count()) >= 2);
  ok('菜品排行含畅销与滞销', statText.includes('畅销') && statText.includes('卖不动'));
  await page.locator('.adminbar button', { hasText: '库存' }).click();
  await page.waitForFunction(() => document.body.textContent.includes('库存价值'), { timeout: 5000 });
  ok('库存页出现（原料/价值/流水）', (await page.locator('.mrow, .row').count()) >= 1);
  await page.locator('.nav .back').click();               // ← 前台 → 回桌台
  await page.waitForSelector('.tcard', { timeout: 5000 });
  ok('「← 前台」一键返回桌台', true);

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
