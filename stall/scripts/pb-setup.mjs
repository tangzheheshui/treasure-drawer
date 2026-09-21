// PocketBase 一键建集合（幂等，可重复跑）：
//   PB_BASE=https://auth.tangzheheshui.cn PB_EMAIL=xxx PB_PASS=xxx node scripts/pb-setup.mjs
// 兼容 PB 0.23+（_superusers）与 0.22-（admins）两种管理员登录端点。
import { setTimeout as sleep } from 'node:timers/promises';

const base = (process.env.PB_BASE || '').replace(/\/$/, '');
const email = process.env.PB_EMAIL;
const pass = process.env.PB_PASS;
if (!base || !email || !pass) {
  console.log('用法: PB_BASE=https://your-pb PB_EMAIL=admin PB_PASS=xxx node scripts/pb-setup.mjs');
  process.exit(1);
}

async function api(path, opts = {}, token) {
  const r = await fetch(base + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}), ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// 管理员登录：先试 0.23+ 的 _superusers，再退回旧 admins
let token = null;
for (const path of ['/api/collections/_superusers/auth-with-password', '/api/admins/auth-with-password']) {
  try {
    const r = await api(path, { method: 'POST', body: JSON.stringify({ identity: email, password: pass }) });
    token = r.token;
    console.log(`✓ 管理员登录成功（${path}）`);
    break;
  } catch (e) { /* 试下一个 */ }
}
if (!token) { console.log('✗ 管理员登录失败：检查 PB_BASE / PB_EMAIL / PB_PASS'); process.exit(1); }

const collections = [
  {
    name: 'stall_shops',
    fields: [
      { name: 'owner', type: 'text', required: true },
      { name: 'name', type: 'text' },
      { name: 'tableCount', type: 'number' },
      { name: 'menu', type: 'json' },
      { name: 'served', type: 'json' }, // 每桌/每自取单的出餐进度快照
    ],
    listRule: '', viewRule: '',
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: 'owner = @request.auth.id',
    deleteRule: 'owner = @request.auth.id',
  },
  {
    name: 'stall_orders',
    fields: [
      { name: 'shop', type: 'text', required: true },
      { name: 'table', type: 'number', required: true },
      { name: 'items', type: 'json' },
      { name: 'total', type: 'number' },
      { name: 'code', type: 'text' }, // 单号：店内唯一（索引兜底），用于叫号/小票
    ],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_stall_orders_shop_code ON stall_orders (shop, code)'],
    listRule: '', viewRule: '', createRule: '', updateRule: null, deleteRule: null,
  },
  {
    name: 'stall_calls',
    fields: [
      { name: 'shop', type: 'text', required: true },
      { name: 'table', type: 'number', required: true },
    ],
    listRule: '', viewRule: '', createRule: '', updateRule: null, deleteRule: null,
  },
];

for (const col of collections) {
  try {
    await api(`/api/collections/${col.name}`, {}, token);
    await api(`/api/collections/${col.name}`, { method: 'PATCH', body: JSON.stringify(col) }, token);
    console.log(`✓ 更新集合 ${col.name}（规则已刷新）`);
  } catch (e) {
    if (String(e).includes('404')) {
      await api('/api/collections', { method: 'POST', body: JSON.stringify(col) }, token);
      console.log(`✓ 新建集合 ${col.name}`);
    } else {
      console.log(`✗ ${col.name}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  await sleep(150);
}

console.log('\n完成。下一步：摊主端「设置 → 联机」注册/登录（服务器填 ' + base + '），然后生成桌号二维码。');
