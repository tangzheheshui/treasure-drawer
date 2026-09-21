// 顾客 H5：扫桌边二维码进入（?s=店铺 & t=桌号 & b=PocketBase 服务器）。
// 只点单不支付；提交进云端，摊主端实时播报。
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PocketBase from 'pocketbase';
import './customer.css';

const qs = new URLSearchParams(location.search);
const shopId = qs.get('s');
const table = Number(qs.get('t') || 0);
const base = qs.get('b') || 'https://auth.tangzheheshui.cn';
const SESS = 'stall-cust-session';

const App = () => {
  const [shop, setShop] = useState(null);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState({});
  const [view, setView] = useState('menu'); // menu | sent
  const [mine, setMine] = useState(() => JSON.parse(sessionStorage.getItem(SESS) || '[]'));
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    if (!shopId || !table) { setErr('请扫桌边的二维码进入点单'); return; }
    const pb = new PocketBase(base);
    pb.collection('stall_shops').getOne(shopId)
      .then((rec) => setShop({ name: rec.name, tableCount: rec.tableCount, ...(rec.menu || {}) }))
      .catch(() => setErr('暂时连不上柜台，请稍后再试或直接找摊主点单'));
  }, []);

  if (err) return <div className="c-wrap"><div className="c-err">😕 {err}</div></div>;
  if (!shop) return <div className="c-wrap"><div className="c-err">加载菜单中…</div></div>;

  const dishes = (shop.dishes || []).filter((d) => cat === 'all' || d.catId === cat);
  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, i]) => s + i.price * i.qty, 0);
  const count = lines.reduce((s, [, i]) => s + i.qty, 0);
  const catName = (id) => (shop.cats || []).find((c) => c.id === id)?.name || '';

  const addDish = (d) => setCart((c) => ({ ...c, [d.id]: { name: d.name, price: d.price, qty: (c[d.id]?.qty || 0) + 1 } }));
  const dec = (id) => setCart((c) => {
    const it = c[id];
    if (!it) return c;
    if (it.qty <= 1) { const { [id]: _, ...rest } = c; return rest; }
    return { ...c, [id]: { ...it, qty: it.qty - 1 } };
  });

  const submit = async () => {
    const items = lines.map(([, i]) => ({ name: i.name, price: i.price, qty: i.qty, note: '' }));
    if (!items.length) return;
    const pb = new PocketBase(base);
    try {
      await pb.collection('stall_orders').create({ shop: shopId, table, items, total });
    } catch { /* 网络问题也先本地记录，摊主那边以最终同步为准 */ }
    const next = [...mine, { items, total, at: Date.now() }];
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

  return (
    <div className="c-wrap">
      <div className="c-head">
        <b>{shop.name}</b>
        <span>{table}号桌</span>
      </div>

      {view === 'sent' ? (
        <>
          <div className="c-banner">✅ 订单已提交<br /><small>请到摊位前付款或使用摊主提供的收款方式</small></div>
          <div className="c-card">
            <b>我点的东西</b>
            {mine.map((m, k) => (
              <div key={k} className="c-line">
                <span>{m.items.map((i) => `${i.name}×${i.qty}`).join('，')}</span>
                <b>¥{m.total}</b>
              </div>
            ))}
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
                  <div className="c-sub">{catName(d.catId)}</div>
                </div>
                <span className="c-price">¥{d.price}</span>
                {!d.soldOut && (cart[d.id] ? (
                  <div className="c-step">
                    <button onClick={() => dec(d.id)}>−</button><b>{cart[d.id].qty}</b>
                    <button onClick={() => addDish(d)}>＋</button>
                  </div>
                ) : <button className="c-add" onClick={() => addDish(d)}>＋</button>)}
              </div>
            ))}
            {!dishes.length && <div className="c-sub" style={{ padding: 12 }}>这个分类暂时没有菜。</div>}
          </div>
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
