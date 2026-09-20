// 工具预览台启动器：静态服务 tools/ 目录（提供 preview.html）→ 开带界面的 Chrome 窗口。
// 用法：node show-preview.mjs   （五个工具的 dev 服务要先起着：5183–5187）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = 5190;

const server = createServer(async (req, res) => {
  try {
    const p = req.url === '/' ? '/preview.html' : req.url.split('?')[0];
    const d = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 940, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/preview.html`);
await page.waitForTimeout(600);

console.log(`[preview] 预览台已打开：http://localhost:${PORT}/preview.html；关掉窗口本脚本自动退出`);
browser.on('disconnected', () => process.exit(0));
setInterval(() => {}, 1 << 30);
