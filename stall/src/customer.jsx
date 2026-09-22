// 顾客 H5：扫桌边二维码进入（?s=店铺 & t=桌号 & b=PocketBase 服务器）。
// 只点单不支付；提交进云端，摊主端实时播报。
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PocketBase from 'pocketbase';
import './customer.css';

const qs = new URLSearchParams(location.search);
const shopId = qs.get('s');
const table = Number(qs.get('t') || 0); // 0 = 无桌号（自取/外带散单）
const base = qs.get('b') || 'https://auth.tangzheheshui.cn';
const SESS = 'stall-cust-session';

// 单号：4 位不易混淆字符，数据库唯一索引兜底不重复
const CS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 4 }, () => CS[Math.floor(Math.random() * CS.length)]).join('');

// 规格（辣度/份量）：与摊主端 store.js 同一套口径的本地复制（顾客页独立入口，不引摊主状态库）
const specsOf = (d) => (Array.isArray(d?.specs) ? d.specs : []).filter((g) => g && g.name && Array.isArray(g.opts));
const hasSpecs = (d) => specsOf(d).some((g) => g.opts.length);
const selText = (d, sel) => specsOf(d).map((g) => sel?.[g.name]).filter(Boolean).join('/');
const unitPrice = (d, sel) => specsOf(d).reduce((s, g) => s + (g.opts.find((o) => o && o.n === sel?.[g.name])?.d || 0), Number(d?.price) || 0);

const App = () => {
  const [shop, setShop] = useState(null);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState({}); // `${dishId}|${spec}` -> { dishId, name, price(含差价), qty, spec, sel }
  const [view, setView] = useState('menu'); // menu | sent
  const [mine, setMine] = useState(() => JSON.parse(sessionStorage.getItem(SESS) || '[]'));
  const [calling, setCalling] = useState(false);
  const [pick, setPick] = useState(null); // 带规格的菜：{ dish, sel }

  useEffect(() => {
    if (!shopId || !table) { setErr('请扫桌边的二维码进入点单'); return; }
    const pb = new PocketBase(base);
    const apply = (rec) => setShop({ name: rec.name, tableCount: rec.tableCount, served: rec.served || {}, ...(rec.menu || {}) });
    pb.collection('stall_shops').getOne(shopId)
      .then((rec) => {
        apply(rec);
        // 实时订阅：出餐进度/菜单更新即时刷新
        pb.collection('stall_shops').subscribe(shopId, (e) => { if (e.record) apply(e.record); });
      })
      .catch(() => setErr('暂时连不上柜台，请稍后再试或直接找摊主点单'));
    return () => { try { pb.collection('stall_shops').unsubscribe(shopId); } catch { /* 忽略 */ } };
  }, []);

  if (err) return <div className="c-wrap"><div className="c-err">😕 {err}</div></div>;
  if (!shop) return <div className="c-wrap"><div className="c-err">加载菜单中…</div></div>;

  const dishes = (shop.dishes || []).filter((d) => cat === 'all' || d.catId === cat);
  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, i]) => s + i.price * i.qty, 0);
  const count = lines.reduce((s, [, i]) => s + i.qty, 0);
  const catName = (id) => (shop.cats || []).find((c) => c.id === id)?.name || '';

  const addLine = (d, sel) => setCart((c) => {
    const spec = selText(d, sel);
    const key = `${d.id}|${spec}`;
    return { ...c, [key]: { dishId: d.id, name: d.name, price: unitPrice(d, sel), qty: (c[key]?.qty || 0) + 1, spec, sel: sel || undefined } };
  });
  const tapDish = (d) => {
    if (d.soldOut) return;
    if (hasSpecs(d)) {
      const sel = Object.fromEntries(specsOf(d).map((g) => [g.name, g.opts[0]?.n]).filter(([, v]) => v));
      setPick({ dish: d, sel });
    } else addLine(d, null);
  };
  const dec = (key) => setCart((c) => {
    const it = c[key];
    if (!it) return c;
    if (it.qty <= 1) { const { [key]: _, ...rest } = c; return rest; }
    return { ...c, [key]: { ...it, qty: it.qty - 1 } };
  });
  const inc = (key) => setCart((c) => ({ ...c, [key]: { ...c[key], qty: c[key].qty + 1 } }));

  const submit = async () => {
    const items = lines.map(([, i]) => ({ name: i.name, price: i.price, qty: i.qty, note: '', spec: i.spec || '' }));
    if (!items.length) return;
    const pb = new PocketBase(base);
    let code = genCode();
    let recId = null;
    for (let tries = 0; tries < 3; tries++) {
      try {
        const rec = await pb.collection('stall_orders').create({ shop: shopId, table, code, items, total });
        recId = rec.id;
        break;
      } catch {
        code = genCode(); // 单号撞了就换一个重试（唯一索引兜底）
      }
    }
    const next = [...mine, { id: recId, code, items, total, at: Date.now() }];
    setMine(next);
    sessionStorage.setItem(SESS, JSON.stringify(next));
    setCart({});
    setView('sent');
  };

  const call = async () => {
    if (calling) return;
    setCalling(true);
    const pb = new PocketBase(base);
    try { await pb.collection('stall_calls').create({ shop: shopId, table }); } catch { /* 尽力呼叫 */ }
    setTimeout(() => setCalling(false), 30000);
    alert('已呼叫摊主，请稍等');
  };

  const mineTotal = mine.reduce((s, m) => s + m.total, 0);

  const unserved = shop.served?.[table];

  return (
    <div className="c-wrap">
      <div className="c-head">
        <b>{shop.name}</b>
        <span>{table ? `${table}号桌` : '自取单'}</span>
      </div>

      {unserved !== undefined && (
        <div className={`c-progress ${unserved === 0 ? 'done' : ''}`}>
          {unserved === 0 ? '✅ 本桌菜品已全部出餐' : `🍳 本桌还有 ${unserved} 份未出餐，做好了会在这里更新`}
        </div>
      )}

      {view === 'sent' ? (
        <>
          <div className="c-banner">✅ 订单已提交<br /><small>请到摊位前付款或使用摊主提供的收款方式</small></div>
          <div className="c-card">
            <b>我点的东西</b>
            {mine.map((m, k) => {
              const tot = m.items.reduce((s, i) => s + i.qty, 0);
              const rem = m.id ? (shop.served || {})[m.id] : undefined;
              return (
                <div key={k} style={{ borderBottom: '1px solid #eee9dd', paddingBottom: 6, marginBottom: 6 }}>
                  <div className="c-line">
                    <span>{m.code ? `单号 ${m.code} · ` : ''}{m.items.map((i) => `${i.name}${i.spec ? `(${i.spec})` : ''}×${i.qty}`).join('，')}</span>
                    <b>¥{m.total}</b>
                  </div>
                  {!table && rem !== undefined && (
                    <div className={rem === 0 ? 'c-tip' : 'c-sub'} style={{ color: rem === 0 ? '#2b7a4b' : '#c2571a' }}>
                      {rem === 0 ? '✅ 这单已全部出餐' : `🍳 已出 ${tot - rem}/${tot} 份`}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="c-total">合计 <b>¥{mineTotal}</b></div>
            <div className="c-tip">想加菜？随时再点，会并到这桌的账单里。</div>
          </div>
          <button className="c-btn ghost" onClick={() => setView('menu')}>＋ 继续加菜</button>
        </>
      ) : (
        <>
          <div className="c-cats">
            <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>全部</button>
            {(shop.cats || []).map((c) => (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
            ))}
          </div>
          <div className="c-card">
            {dishes.map((d) => (
              <div className="c-row" key={d.id} style={{ opacity: d.soldOut ? 0.45 : 1 }}>
                <div className="grow">
                  <b>{d.name}</b>
                  <div className="c-sub">{catName(d.catId)}{hasSpecs(d) ? ` · ${specsOf(d).map((g) => g.name).join('/')}` : ''}</div>
                </div>
                <span className="c-price">¥{d.price}{hasSpecs(d) && <span style={{ fontSize: 11 }}>起</span>}</span>
                {!d.soldOut && (cart[`${d.id}|`] ? (
                  <div className="c-step">
                    <button onClick={() => dec(`${d.id}|`)}>−</button><b>{cart[`${d.id}|`].qty}</b>
                    <button onClick={() => tapDish(d)}>＋</button>
                  </div>
                ) : <button className="c-add" onClick={() => tapDish(d)}>＋</button>)}
              </div>
            ))}
            {!dishes.length && <div className="c-sub" style={{ padding: 12 }}>这个分类暂时没有菜。</div>}
          </div>

          {pick && (
            <div className="c-mask" onClick={() => setPick(null)}>
              <div className="c-modal" onClick={(e) => e.stopPropagation()}>
                <b className="c-modal-title">{pick.dish.name} <span className="c-price">¥{unitPrice(pick.dish, pick.sel)}</span></b>
                {specsOf(pick.dish).map((g) => (
                  <div key={g.name} style={{ marginTop: 10 }}>
                    <div className="c-sub" style={{ marginBottom: 6 }}>{g.name}</div>
                    <div className="c-chips">
                      {g.opts.map((o) => (
                        <button key={o.n} className={pick.sel[g.name] === o.n ? 'c-chip on' : 'c-chip'}
                                onClick={() => setPick((p) => ({ ...p, sel: { ...p.sel, [g.name]: o.n } }))}>
                          {o.n}{o.d ? ` ${o.d > 0 ? '+' : ''}${o.d}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="c-btn block" style={{ marginTop: 14 }}
                        onClick={() => { addLine(pick.dish, pick.sel); setPick(null); }}>加入购物车</button>
              </div>
            </div>
          )}
          <div className="c-cartbar">
            <span className="c-sum">¥{total}</span>
            <span className="c-sub">{count} 份</span>
            <button className="c-btn" disabled={!lines.length} onClick={submit}>提交订单</button>
          </div>
        </>
      )}

      <button className="c-call" onClick={call}>{calling ? '已呼叫，等摊主…' : '🔔 呼叫摊主'}</button>
    </div>
  );
};

createRoot(document.getElementById('root')).render(<App />);
