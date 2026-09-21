import React, { useMemo, useState } from 'react';
import { submitOrder, sayItemsText } from '../store.js';
import { say } from '../voice.js';

export default function TakeOrder({ db, update, tableNo, add, nav }) {
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState({}); // dishId -> { name, price, qty, note }
  const [showCart, setShowCart] = useState(false);

  const dishes = useMemo(
    () => db.dishes.filter((d) => cat === 'all' || d.catId === cat),
    [db, cat]
  );
  const cats = db.cats;
  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, i]) => s + i.price * i.qty, 0);
  const count = lines.reduce((s, [, i]) => s + i.qty, 0);

  const addDish = (d) => setCart((c) => ({ ...c, [d.id]: { name: d.name, price: d.price, qty: (c[d.id]?.qty || 0) + 1, note: c[d.id]?.note || '' } }));
  const dec = (id) => setCart((c) => {
    const it = c[id];
    if (!it) return c;
    if (it.qty <= 1) { const { [id]: _, ...rest } = c; return rest; }
    return { ...c, [id]: { ...it, qty: it.qty - 1 } };
  });
  const setNote = (id, note) => setCart((c) => ({ ...c, [id]: { ...c[id], note } }));

  const submit = () => {
    if (!lines.length) return;
    const items = lines.map(([, i]) => ({ name: i.name, price: i.price, qty: i.qty, note: i.note || '' }));
    update((d) => submitOrder(d, tableNo, items, add));
    say(sayItemsText(tableNo, items, add ? '加单' : ''));
    nav(add ? `#/table/${tableNo}` : '#/tables');
  };

  return (
    <>
      <div className="nav">
        <button className="back" onClick={() => nav(add ? `#/table/${tableNo}` : '#/tables')}>← 返回</button>
        {tableNo}号桌 {add ? '加菜' : '点单'}
        <button className="act" onClick={() => setShowCart(true)}>购物车{count ? ` ${count}` : ''}</button>
      </div>
      <div className="page">
        <div className="catbar">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>全部</button>
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
        <div className="card" style={{ padding: '4px 14px' }}>
          {dishes.map((d) => (
            <div className="row" key={d.id} style={{ opacity: d.soldOut ? 0.45 : 1 }}>
              <div className="grow">
                <div className="name">{d.name}{d.soldOut && <span className="pill" style={{ marginLeft: 8 }}>售罄</span>}</div>
              </div>
              <span className="price">¥{d.price}</span>
              {!d.soldOut && (
                cart[d.id] ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="sqbtn" onClick={() => dec(d.id)}>−</button>
                    <b>{cart[d.id].qty}</b>
                    <button className="sqbtn" onClick={() => addDish(d)}>＋</button>
                  </div>
                ) : (
                  <button className="sqbtn" onClick={() => addDish(d)}>＋</button>
                )
              )}
            </div>
          ))}
          {!dishes.length && <div className="sub" style={{ padding: 16 }}>这个分类还没有菜，去「菜品」页添加。</div>}
        </div>
      </div>

      <div className="cartbar">
        <span className="sum">¥{total}</span>
        <span className="sub">{count} 份</span>
        <button className="btn primary" disabled={!lines.length} onClick={submit}>
          提交{add ? '加单' : '下单'}
        </button>
      </div>

      {showCart && (
        <div className="mask" onClick={() => setShowCart(false)}>
          <div className="modal" style={{ width: '92%', maxWidth: 400, maxHeight: '70vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>购物车（{tableNo}号桌{add ? ' · 加菜' : ''}）</h3>
            {lines.map(([id, i]) => (
              <div key={id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow"><b>{i.name}</b> <span className="sub">¥{i.price}</span></div>
                  <button className="sqbtn" onClick={() => dec(id)}>−</button>
                  <b>{i.qty}</b>
                  <button className="sqbtn" onClick={() => addDish({ id, name: i.name, price: i.price })}>＋</button>
                  <button className="sqbtn del" onClick={() => setCart((c) => { const { [id]: _, ...rest } = c; return rest; })}>✕</button>
                </div>
                <input className="f" placeholder="备注：不要辣、多放蒜…" value={i.note}
                       onChange={(e) => setNote(id, e.target.value)} style={{ marginTop: 6 }} />
              </div>
            ))}
            {!lines.length && <div className="sub">还没选菜，去挑几样。</div>}
            <div className="mfoot">
              <button className="btn" onClick={() => setShowCart(false)}>继续点菜</button>
              <button className="btn primary" disabled={!lines.length} onClick={submit}>提交（¥{total}）</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
