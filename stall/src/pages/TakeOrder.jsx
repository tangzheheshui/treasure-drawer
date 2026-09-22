import React, { useMemo, useRef, useState } from 'react';
import { submitOrder, sayItemsText } from '../store.js';
import { parseOrderTranscript } from '../parseOrder.js';
import { say } from '../voice.js';

// 语音识别：浏览器内置 ASR（与播报同族的 Web Speech 能力），不支持的环境隐藏麦克风
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function TakeOrder({ db, update, tableNo, walk, add, nav }) {
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState({}); // dishId -> { name, price, qty, note }
  const [showCart, setShowCart] = useState(false);
  const [guests, setGuests] = useState(4);
  // 语音点菜：listening=正在听（实时上屏）→ preview=整理出的单子预览（改完才进购物车）
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [preview, setPreview] = useState(null); // { text, items:[{dishId,name,qty,fuzzy}], leftover }
  const [swap, setSwap] = useState(-1);         // 预览里正在换菜的那一行
  const recRef = useRef(null);
  const finalRef = useRef('');

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

  // ── 语音点菜 ──
  const startVoice = () => {
    if (!SR) return;
    const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    rec.lang = 'zh-CN';
    rec.interimResults = true; // 边说边上屏
    rec.maxAlternatives = 1;
    finalRef.current = '';
    rec.onresult = (e) => {
      let fin = '', mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else mid += e.results[i][0].transcript;
      }
      if (fin) finalRef.current += fin;
      setLive(finalRef.current + mid);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('麦克风没权限，请在浏览器设置里允许后重试');
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (text) setPreview(parseOrderTranscript(text, db.dishes)); // 整理成单子预览，改完才入账
    };
    recRef.current = rec;
    setLive('');
    setSwap(-1);
    setListening(true);
    try { rec.start(); } catch { /* 重复 start 忽略 */ }
  };
  const stopVoice = () => { try { recRef.current?.stop(); } catch { /* 已停 */ } };

  // 预览行编辑：数量 / 换菜 / 删行
  const editRow = (i, patch) => setPreview((p) => ({ ...p, items: p.items.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const dropRow = (i) => setPreview((p) => ({ ...p, items: p.items.filter((_, k) => k !== i) }));
  const previewCount = preview ? preview.items.reduce((s, i) => s + i.qty, 0) : 0;

  // 确认无误 → 并进购物车（购物车仍是提交前唯一的账本）
  const mergePreview = () => {
    setCart((c) => {
      const n = { ...c };
      preview.items.forEach((r) => {
        const d = db.dishes.find((x) => x.id === r.dishId);
        if (!d || d.soldOut) return;
        n[d.id] = { name: d.name, price: d.price, qty: (n[d.id]?.qty || 0) + r.qty, note: n[d.id]?.note || '' };
      });
      return n;
    });
    setPreview(null);
  };

  const submit = () => {
    if (!lines.length) return;
    const items = lines.map(([, i]) => ({ name: i.name, price: i.price, qty: i.qty, note: i.note || '' }));
    if (walk) {
      let newId;
      update((d) => { const o = submitOrder(d, { mode: 'walk' }, items, true); newId = o.id; });
      say(`新散单，${items.map((i) => `${i.name}${i.qty}份`).join('，')}`);
      nav(`#/o/${newId}`);
      return;
    }
    const order = (() => { let r; update((d) => { r = submitOrder(d, tableNo, items, add, guests); }); return r; })();
    say(sayItemsText(tableNo, items, add ? '加单' : ''));
    nav(add ? `#/o/${order.id}` : '#/tables');
  };

  return (
    <>
      <div className="nav">
        <button className="back" onClick={() => nav(walk ? '#/tables' : add ? `#/table/${tableNo}` : '#/tables')}>← 返回</button>
        {walk ? '散客点单' : `${tableNo}号桌 ${add ? '加菜' : '点单'}`}
        <button className="act" onClick={() => setShowCart(true)}>购物车{count ? ` ${count}` : ''}</button>
      </div>
      <div className="page">
        {!add && !walk && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px' }}>
            <b>人数</b>
            <span className="sub" style={{ marginLeft: 8 }}>开台先选几位</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="sqbtn" onClick={() => setGuests(Math.max(1, guests - 1))}>−</button>
              <b style={{ fontSize: 18, minWidth: 26, textAlign: 'center' }}>{guests}</b>
              <button className="sqbtn" onClick={() => setGuests(Math.min(50, guests + 1))}>＋</button>
            </div>
          </div>
        )}
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
        {SR && <button className="micbtn" title="说话点菜" onClick={listening ? stopVoice : startVoice}>🎤</button>}
        <span className="sum">¥{total}</span>
        <span className="sub">{count} 份</span>
        <button className="btn primary" disabled={!lines.length} onClick={submit}>
          提交{add ? '加单' : '下单'}
        </button>
      </div>

      {/* 正在听：实时转写上屏，说完停顿自动整理；点任意处提前结束 */}
      {listening && (
        <div className="mask" onClick={stopVoice}>
          <div className="listen">
            <div className="micbig">🎤</div>
            <div className="ltext">{live || '请说话…'}</div>
            <div className="sub" style={{ color: '#fff' }}>例如「羊肉串二十串可乐两瓶」<br />说完停一下自动整理，点屏幕任意处结束</div>
          </div>
        </div>
      )}

      {/* 单子预览：识别不一定准，改到对为止（数量加减 / 点菜名换菜 / 删行） */}
      {preview && (
        <div className="mask" onClick={() => setPreview(null)}>
          <div className="modal" style={{ width: '92%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>🎙 听到的单子（{previewCount} 份）</h3>
            <div className="sub" style={{ marginBottom: 4 }}>原话：{preview.text || '（空）'}</div>
            {preview.items.map((r, i) => (
              <div key={i}>
                <div className="vrow">
                  <div className="grow" onClick={() => setSwap(swap === i ? -1 : i)} style={{ cursor: 'pointer' }}>
                    <b>{r.name}</b>
                    {r.fuzzy && <span className="pill warn" style={{ marginLeft: 6 }}>认成了？</span>}
                    <div className="sub">点菜名可换菜</div>
                  </div>
                  <button className="sqbtn" onClick={() => editRow(i, { qty: Math.max(1, r.qty - 1) })}>−</button>
                  <b>{r.qty}</b>
                  <button className="sqbtn" onClick={() => editRow(i, { qty: Math.min(999, r.qty + 1) })}>＋</button>
                  <button className="sqbtn del" onClick={() => dropRow(i)}>✕</button>
                </div>
                {swap === i && (
                  <div className="vswap">
                    {db.dishes.filter((d) => !d.soldOut).map((d) => (
                      <div className="row" key={d.id} onClick={() => { editRow(i, { dishId: d.id, name: d.name, fuzzy: false }); setSwap(-1); }}>
                        <div className="grow name">{d.name}</div>
                        <span className="price">¥{d.price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!preview.items.length && <div className="sub" style={{ padding: '8px 0' }}>没听出菜名，再说一遍试试？</div>}
            {preview.leftover && <div className="sub" style={{ color: 'var(--warn)' }}>没对上号：「{preview.leftover}」（对不上就手动加）</div>}
            <div className="mfoot">
              <button className="btn" onClick={() => { setPreview(null); startVoice(); }}>再说一遍</button>
              <button className="btn primary" disabled={!preview.items.length} onClick={mergePreview}>进购物车</button>
            </div>
          </div>
        </div>
      )}

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
