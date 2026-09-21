// 整库状态 + 本地持久化（idb-keyval）。联机阶段在此换/叠加 PocketBase 适配器，UI 不动。
import { get, set } from 'idb-keyval';

const KEY = 'stall-db-v1';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function seed() {
  const c1 = uid(), c2 = uid(), c3 = uid(), c4 = uid();
  const d = (catId, name, price) => ({ id: uid(), catId, name, price, soldOut: false });
  return {
    shop: { name: '老王烧烤', tableCount: 8, voice: true, volume: 1 },
    cats: [
      { id: c1, name: '串类' },
      { id: c2, name: '酒水' },
      { id: c3, name: '主食' },
      { id: c4, name: '小菜' },
    ],
    dishes: [
      d(c1, '羊肉串', 6), d(c1, '牛肉串', 6), d(c1, '鸡翅', 8), d(c1, '烤面筋', 3), d(c1, '烤韭菜', 5),
      d(c2, '啤酒（瓶）', 10), d(c2, '可乐', 3), d(c2, '矿泉水', 2),
      d(c3, '烤冷面', 8), d(c3, '炒粉', 10), d(c3, '烤馒头片', 3),
      d(c4, '花毛一体', 6), d(c4, '拍黄瓜', 8), d(c4, '蒜泥茄子', 10),
    ],
    orders: [], // { id, tableNo, status: 'active'|'closed', items:[{id,name,price,qty,note,served}], createdAt, closedAt }
    calls: [],  // [{ tableNo, at }]
  };
}

let db = null;
const subs = new Set();
let saveTimer = null;

export async function loadDB() {
  if (!db) db = (await get(KEY)) || seed();
  return db;
}

export function getDB() {
  return db;
}

// 变更入口：先改再 mutate 触发重渲染 + 防抖落盘
export function mutate(fn) {
  if (!db) return;
  fn(db);
  subs.forEach((f) => f());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => set(KEY, db), 200);
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// ── 派生 ──
export const activeOrder = (db, tableNo) => db.orders.find((o) => o.status === 'active' && o.tableNo === tableNo);
export const orderTotal = (o) => o.items.reduce((s, i) => s + i.price * i.qty, 0);
export const unservedCount = (o) => o.items.filter((i) => !i.served).reduce((s, i) => s + i.qty, 0);

export function tableState(db, no) {
  const o = activeOrder(db, no);
  if (!o) return { state: 'idle', order: null };
  return { state: unservedCount(o) === 0 ? 'pending' : 'dining', order: o };
}

export const hasCall = (db, no) => db.calls.some((c) => c.tableNo === no);

// ── 动作 ──
export function submitOrder(db, tableNo, items, isAdd) {
  const o = activeOrder(db, tableNo);
  const lined = items.map((i) => ({ ...i, id: uid(), served: false }));
  if (o) {
    o.items.push(...lined);
  } else {
    db.orders.push({ id: uid(), tableNo, status: 'active', items: lined, createdAt: Date.now(), closedAt: null });
  }
  return lined;
}

export function sayItemsText(tableNo, items, prefix) {
  const body = items.map((i) => `${i.name}${i.qty}份`).join('，');
  return `${tableNo}号桌${prefix}，${body}`;
}

export function markServed(db, orderId, itemId) {
  const o = db.orders.find((x) => x.id === orderId);
  const i = o && o.items.find((x) => x.id === itemId);
  if (i) i.served = true;
}

export function serveAll(db, orderId) {
  const o = db.orders.find((x) => x.id === orderId);
  if (o) o.items.forEach((i) => { i.served = true; });
}

export function removeItem(db, orderId, itemId) {
  const o = db.orders.find((x) => x.id === orderId);
  if (o) o.items = o.items.filter((x) => x.id !== itemId);
}

export function clearTable(db, tableNo) {
  const o = activeOrder(db, tableNo);
  if (o) { o.status = 'closed'; o.closedAt = Date.now(); }
  db.calls = db.calls.filter((c) => c.tableNo !== tableNo);
}

export function callTable(db, tableNo, pbId) {
  db.calls = db.calls.filter((c) => c.tableNo !== tableNo);
  db.calls.push({ tableNo, at: Date.now(), pbId });
}

export function answerCall(db, tableNo) {
  db.calls = db.calls.filter((c) => c.tableNo !== tableNo);
}

// 顾客 H5 实时进单：合并进该桌活跃订单（首次=新单，其后=加单），返回是加单还是新单
export function ingestRemoteOrder(db, tableNo, items) {
  const isAdd = !!activeOrder(db, tableNo);
  submitOrder(db, tableNo, items.map((i) => ({ name: i.name, price: i.price, qty: i.qty, note: i.note || '' })), true);
  return isAdd;
}
