// 无头自检：起静态服务跑 dist，用系统 Chrome 真点一遍核心链路。
// 用程序生成的「白底 + 中央黑水印」测试图，断言画布像素级别的结果。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const root = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(4183, r));

// ── 极简 PNG 编码器（node 内置 zlib，无需依赖）──
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(w, h, fn) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const o = y * (stride + 1) + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 测试图：400×300 白底，中央 60×60 黑块当「水印」（x 170..230, y 120..180）
const img = png(400, 300, (x, y) => (x >= 170 && x <= 230 && y >= 120 && y <= 180 ? [0, 0, 0] : [255, 255, 255]));

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message || String(e)));

try {
  await page.goto('http://localhost:4183/');
  ok('① 空态有「打开图片」按钮', await page.getByText('打开图片').isVisible());

  await page.setInputFiles('input[type=file]', { name: 'test.png', mimeType: 'image/png', buffer: img });
  await page.waitForTimeout(300);
  ok('② 载入后保存按钮可用', await page.locator('.save').isEnabled());

  // 复刻 engine.fit 算出图片在画布上的落位
  const box = await page.locator('canvas').boundingBox();
  const s = Math.min(box.width / 400, box.height / 300) * 0.96;
  const ox = box.x + (box.width - 400 * s) / 2;
  const oy = box.y + (box.height - 300 * s) / 2;
  const at = (ix, iy) => ({ x: ox + ix * s, y: oy + iy * s });
  const px = (ix, iy) => {
    const p = at(ix, iy);
    return page.evaluate(([x, y]) => {
      const d = document.querySelector('canvas').getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [p.x, p.y]);
  };

  ok('③ 水印中心初始是黑', (await px(200, 150)).every((v) => v < 20));

  // 智能取样笔横穿水印（默认工具就是笔，笔迹应被周边白底填成白）
  const a1 = at(170, 150), a2 = at(230, 150);
  await page.mouse.move(a1.x, a1.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(a1.x + ((a2.x - a1.x) * i) / 10, a1.y);
  await page.mouse.up();
  await page.waitForTimeout(100);
  ok('④ 智能笔涂过：水印变成周边底色（白）', (await px(200, 150)).every((v) => v > 230));

  await page.locator('.tb[title=撤销]').click();
  ok('⑤ 撤销：水印回来（黑）', (await px(200, 150)).every((v) => v < 20));
  await page.locator('.tb[title=重做]').click();
  ok('⑥ 重做：又涂掉（白）', (await px(200, 150)).every((v) => v > 230));

  // 吸管：点黑块未被笔迹盖到的位置，取到黑色并自动回笔 + 固定色标记
  const ap = at(200, 125);
  await page.locator('.tb[title=吸管取色]').click();
  await page.mouse.click(ap.x, ap.y);
  await page.waitForTimeout(200);
  ok('⑦ 吸管取色后笔上出现固定色标记', (await page.locator('.tb .dot').count()) > 0);
  ok('⑧ Toast 报出色值 rgb(0,0,0)', ((await page.locator('.adm-toast-wrap').textContent().catch(() => '')) || '').includes('rgb(0,0,0)'));

  // 固定色笔：在白处涂应为黑
  const f1 = at(300, 60);
  await page.mouse.move(f1.x, f1.y);
  await page.mouse.down();
  await page.mouse.move(f1.x + 20, f1.y, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  ok('⑨ 固定色笔涂出的是取到的黑色', (await px(300, 60)).every((v) => v < 30));

  // 橡皮：把固定色笔迹擦回原图（白）
  await page.locator('.tb[title=橡皮]').click();
  await page.mouse.move(f1.x - 5, f1.y);
  await page.mouse.down();
  await page.mouse.move(f1.x + 25, f1.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  ok('⑩ 橡皮擦回原图（白）', (await px(300, 60)).every((v) => v > 230));

  // 保存：一键直下（无弹层）
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.locator('.save').click()]);
  ok('⑪ 保存一键直下且文件名对', dl && dl.suggestedFilename() === 'test-erased.png');

  // 滚轮缩放不炸
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(100);
  ok('⑫ 滚轮缩放无报错', errors.length === 0);

  ok('⑬ 全程无页面错误', errors.length === 0);
} catch (e) {
  ok(`自检中断：${e.message}`, false);
}

await browser.close();
server.close();

let fail = 0;
for (const [name, pass] of results) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) fail++;
}
if (errors.length) console.log('页面错误：\n' + errors.map((e) => '  ' + e).join('\n'));
console.log(fail ? `\n${fail} 项未过` : `\n${results.length} 项全过`);
process.exit(fail ? 1 : 0);
