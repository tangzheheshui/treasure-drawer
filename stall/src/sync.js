// PocketBase 联机适配器：登录 → 店铺记录 → 发布菜单 → 实时收单/收呼叫。
// 纯本地功能不依赖这里；所有请求失败都静默降级（摊主端离线照常记单）。
import PocketBase from 'pocketbase';
import { mutate, getDB, subscribe, activeOrder, submitOrder, callTable, answerCall, sayItemsText, unservedCount } from './store.js';
import { say } from './voice.js';

let pb = null;
const getClient = (base) => {
  if (!pb || pb.baseURL !== base) pb = new PocketBase(base);
  return pb;
};

export const isOnline = (db) => !!(db.shop.pbBase && db.shop.pbId);

export async function login(base, email, pass) {
  const c = getClient(base);
  await c.collection('users').authWithPassword(email, pass);
  return c;
}

export async function register(base, email, pass) {
  const c = getClient(base);
  await c.collection('users').create({ email, password: pass, passwordConfirm: pass });
  await c.collection('users').authWithPassword(email, pass);
}

// 登录后确保有店铺记录，回填 pbId
export async function ensureShop(db) {
  const c = getClient(db.shop.pbBase);
  const uid = c.authStore.record?.id;
  if (!uid) throw new Error('未登录');
  const res = await c.collection('stall_shops').getList(1, 1, { filter: `owner = "${uid}"` });
  const rec = res.items[0] || await c.collection('stall_shops').create({
    owner: uid, name: db.shop.name, tableCount: db.shop.tableCount,
    menu: { cats: db.cats, dishes: db.dishes },
  });
  mutate((d) => { d.shop.pbId = rec.id; });
  return rec;
}

// 出餐快照：桌单按桌号（未出份数）；自取单按云端记录 id（顾客页按单刷新进度）
export function servedSnapshot(db) {
  const out = {};
  db.orders.filter((o) => o.status === 'active').forEach((o) => {
    if (o.mode === 'walk') {
      (o.batches || []).forEach((b) => {
        if (b.pbId) out[b.pbId] = unservedItems(b);
      });
    } else {
      out[o.tableNo] = unservedCount(o);
    }
  });
  return out;
}
const unservedItems = (b) => b.items.filter((i) => !i.served).reduce((s, i) => s + i.qty, 0);

export async function publishMenu(db) {
  if (!isOnline(db)) return;
  const c = getClient(db.shop.pbBase);
  try {
    await c.collection('stall_shops').update(db.shop.pbId, {
      name: db.shop.name, tableCount: db.shop.tableCount,
      menu: { cats: db.cats, dishes: db.dishes },
      served: servedSnapshot(db),
    });
    return true;
  } catch { return false; }
}

// 实时：顾客下单 → 合并本地 + 播报；顾客呼叫 → 闪卡 + 播报。返回退订函数。
export function subscribeRealtime(db, onChange) {
  const c = getClient(db.shop.pbBase);
  const shopId = db.shop.pbId;
  const subs = [];
  subs.push(c.collection('stall_orders').subscribe('*', (e) => {
    if (e.action !== 'create' || e.record.shop !== shopId) return;
    const tableNo = Number(e.record.table);
    const items = e.record.items || [];
    const code = e.record.code;
    let fresh = false, isAdd = false, isTakeout = false;
    mutate((d) => {
      d.seen = d.seen || [];
      if (d.seen.includes(e.record.id)) return;
      if (tableNo === 0) { // 自取/外带散单：不占桌，独立一单
        d.seen.push(e.record.id);
        if (d.seen.length > 500) d.seen = d.seen.slice(-300);
        submitOrder(d, { mode: 'walk', pbId: e.record.id, code }, items, true);
        isTakeout = true; fresh = true;
        return;
      }
      if (tableNo < 1 || tableNo > d.shop.tableCount) return;
      d.seen.push(e.record.id);
      if (d.seen.length > 500) d.seen = d.seen.slice(-300);
      isAdd = !!activeOrder(d, tableNo);
      submitOrder(d, tableNo, items, true);
      fresh = true;
    });
    if (fresh && items.length) {
      say(isTakeout ? `收到自取单，${items.map((i) => `${i.name}${i.qty}份`).join('，')}` : sayItemsText(tableNo, items, isAdd ? '加单' : ''));
      onChange && onChange();
    }
  }));
  subs.push(c.collection('stall_calls').subscribe('*', (e) => {
    if (e.record.shop !== shopId) return;
    const tableNo = Number(e.record.table);
    if (e.action === 'create') {
      mutate((d) => callTable(d, tableNo, e.record.id));
      say(`${tableNo}号桌呼叫`);
      onChange && onChange();
    } else if (e.action === 'delete') {
      mutate((d) => answerCall(d, tableNo));
      onChange && onChange();
    }
  }));
  return () => subs.forEach((u) => u());
}

// 处理呼叫时尽量把云端记录也删掉（删不掉就本地消掉，超时兜底）
export async function answerRemote(db, tableNo) {
  const call = getDB().calls.find((x) => x.tableNo === tableNo);
  if (call && call.pbId && isOnline(db)) {
    try { await getClient(db.shop.pbBase).collection('stall_calls').delete(call.pbId); } catch { /* 离线兜底 */ }
  }
  mutate((d) => answerCall(d, tableNo));
}

// 出餐状态变化 → 防抖发布 served 快照（顾客 H5 实时看出餐进度）
export function attachAutopublish() {
  let t;
  subscribe(() => {
    clearTimeout(t);
    t = setTimeout(() => { const d = getDB(); if (isOnline(d)) publishMenu(d); }, 1200);
  });
}

// 启动静默重连：有配置就恢复实时订阅，失败不打扰
export function bootstrapRealtime(db, onChange) {
  if (!isOnline(db)) return;
  try {
    const c = getClient(db.shop.pbBase);
    if (c.authStore.isValid) {
      subscribeRealtime(db, onChange);
      attachAutopublish();
    }
  } catch { /* 未联机 */ }
}
