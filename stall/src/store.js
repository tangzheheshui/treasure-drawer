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
    orders: [], // { id, tableNo, status: 'active'|'closed', batches:[{id,at,items:[{id,name,price,qty,note,served}],settled}], createdAt, closedAt }
    calls: [],  // [{ tableNo, at }]
    // 库存：原料建档一次；三种动作写流水（in 入库 / use 直接填用量 / count 盘点倒推）
    mats: [
      { id: uid(), name: '羊肉片', unit: '斤', cat: '肉类', safe: 5, stock: 12, lastPrice: 30 },
      { id: uid(), name: '鸡翅', unit: '斤', cat: '肉类', safe: 3, stock: 2, lastPrice: 18 },
      { id: uid(), name: '啤酒', unit: '瓶', cat: '酒水', safe: 10, stock: 24, lastPrice: 5 },
      { id: uid(), name: '竹签', unit: '把', cat: '耗材', safe: 20, stock: 50, lastPrice: 0.5 },
    ],
    moves: [], // { id, matId, matName, unit, type: in|use|count, qty, price?, before, after, diff? , at }
  };
}

let db = null;
const subs = new Set();
let saveTimer = null;

export async function loadDB() {
  if (!db) {
    db = (await get(KEY)) || seed();
    migrate(db);
  }
  return db;
}

// 旧数据迁移：扁平 items → 按「笔」分组（第一版整单分次收款也一并归一到按笔结）
function migrate(d) {
  let dirty = false;
  (d.orders || []).forEach((o) => {
    if (!o.batches) {
      o.batches = [{ id: uid(), at: o.createdAt || Date.now(), items: o.items || [], settled: false }];
      delete o.items;
      delete o.payments;
      dirty = true;
    }
  });
  if (dirty) set(KEY, db);
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
// 订单按「笔」分组：第1笔=首次下单，其后每次加单各成一笔；每笔可单独标记结账/取消
export const batchTotal = (b) => b.items.reduce((s, i) => s + i.price * i.qty, 0);
export const orderTotal = (o) => (o.batches || []).reduce((s, b) => s + batchTotal(b), 0);
export const unservedCount = (o) => (o.batches || []).reduce((s, b) => s + b.items.filter((i) => !i.served).reduce((x, i) => x + i.qty, 0), 0);
export const paidTotal = (o) => (o.batches || []).filter((b) => b.settled).reduce((s, b) => s + batchTotal(b), 0);
export const dueTotal = (o) => orderTotal(o) - paidTotal(o);
export const dueText = (o) => {
  const due = dueTotal(o);
  return due > 0 ? { cls: 'danger', text: `待收 ¥${due}` } : { cls: 'ok', text: '已收齐' };
};

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
  const batch = { id: uid(), at: Date.now(), items: lined, settled: false };
  if (o) {
    o.batches.push(batch);
  } else {
    db.orders.push({ id: uid(), tableNo, status: 'active', batches: [batch], createdAt: Date.now(), closedAt: null });
  }
  return lined;
}

export function sayItemsText(tableNo, items, prefix) {
  const body = items.map((i) => `${i.name}${i.qty}份`).join('，');
  return `${tableNo}号桌${prefix}，${body}`;
}

export function toggleBatchSettled(db, orderId, batchId) {
  const o = db.orders.find((x) => x.id === orderId);
  const b = o && o.batches.find((x) => x.id === batchId);
  if (b) b.settled = !b.settled;
}

export function markServed(db, orderId, itemId) {
  const o = db.orders.find((x) => x.id === orderId);
  const i = o && o.batches.flatMap((b) => b.items).find((x) => x.id === itemId);
  if (i) i.served = true;
}

// 出错了可撤销出餐（桌态由推导自动回到「用餐中」）
export function unserveItem(db, orderId, itemId) {
  const o = db.orders.find((x) => x.id === orderId);
  const i = o && o.batches.flatMap((b) => b.items).find((x) => x.id === itemId);
  if (i) i.served = false;
}

export function serveAll(db, orderId) {
  const o = db.orders.find((x) => x.id === orderId);
  if (o) o.batches.forEach((b) => b.items.forEach((i) => { i.served = true; }));
}

export function removeItem(db, orderId, itemId) {
  const o = db.orders.find((x) => x.id === orderId);
  if (!o) return;
  o.batches.forEach((b) => { b.items = b.items.filter((x) => x.id !== itemId); });
  o.batches = o.batches.filter((b) => b.items.length > 0); // 删空的笔直接移除
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

// ── 库存 ──
export function moveLog(db, m, type, qty, extra = {}) {
  db.moves.unshift({ id: uid(), matId: m.id, matName: m.name, unit: m.unit, type, qty, before: m.stock, after: m.stock, at: Date.now(), ...extra });
}

export function addMat(db, { name, unit, cat, safe, stock, price }) {
  const m = { id: uid(), name: name.trim(), unit: unit.trim() || '份', cat: (cat || '').trim(), safe: Number(safe) || 0, stock: Number(stock) || 0, lastPrice: Number(price) || 0 };
  db.mats.push(m);
  if (m.stock > 0) moveLog(db, m, 'in', m.stock, { price: m.lastPrice }); // 建档带初始库存视作首次入库
  return m;
}

export function removeMat(db, matId) {
  db.mats = db.mats.filter((m) => m.id !== matId);
}

export function stockIn(db, matId, qty, price) {
  const m = db.mats.find((x) => x.id === matId);
  if (!m || !(qty > 0)) return;
  m.stock += qty;
  if (price > 0) m.lastPrice = price;
  moveLog(db, m, 'in', qty, { price: price || undefined });
}

export function stockUse(db, matId, qty) {
  const m = db.mats.find((x) => x.id === matId);
  if (!m || !(qty > 0)) return;
  m.stock -= qty;
  moveLog(db, m, 'use', qty);
}

// 盘点：填实际剩余，倒推用量，差额自动记差异（不填原因）
export function stockCount(db, matId, actual) {
  const m = db.mats.find((x) => x.id === matId);
  if (!m || actual < 0) return;
  const diff = actual - m.stock;
  m.stock = actual;
  moveLog(db, m, 'count', actual, { diff });
}

export const lowMats = (db) => db.mats.filter((m) => m.stock < m.safe);
export const stockValue = (db) => db.mats.reduce((s, m) => s + m.stock * (m.lastPrice || 0), 0);
export const todayMoves = (db) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return db.moves.filter((m) => m.at >= d.getTime());
};
