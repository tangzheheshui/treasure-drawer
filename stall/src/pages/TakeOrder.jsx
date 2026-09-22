import React, { useMemo, useRef, useState } from 'react';
import { submitOrder, sayItemsText, dishSpecs, specSelText, unitPriceOf, hasSpecs } from '../store.js';
import { parseOrderTranscript } from '../parseOrder.js';
import { asrAvailable, asrLive, asrListen } from '../asr.js';
import { say } from '../voice.js';

export default function TakeOrder({ db, update, tableNo, walk, add, nav }) {
  const [cat, setCat] = useState('all');
  const [cart, setCart] = useState({}); // `${dishId}|${spec}` -> { dishId, name, price(含差价), qty, note, spec, sel }
  const [showCart, setShowCart] = useState(false);
  const [guests, setGuests] = useState(4);
  // 规格选择：点了带规格的菜先弹这个，选完才进购物车
  const [pickDish, setPickDish] = useState(null); // { dish, sel: {组名: 选项} }
  // 语音点菜：listening=正在听（实时上屏）→ preview=整理出的单子预览（改完才进购物车）
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [preview, setPreview] = useState(null); // { text, items:[{dishId,name,qty,fuzzy,sel}], leftover }
  const [swap, setSwap] = useState(-1);         // 预览里正在换菜的那一行
  const recRef = useRef(null);                  // 适配器返回的 stop 函数

  const dishes = useMemo(
    () => db.dishes.filter((d) => cat === 'all' || d.catId === cat),
    [db, cat]
  );
  const cats = db.cats;
  const lines = Object.entries(cart);
  const total = lines.reduce((s, [, i]) => s + i.price * i.qty, 0);
  const count = lines.reduce((s, [, i]) => s + i.qty, 0);

  const addLine = (d, sel) => setCart((c) => {
    const spec = specSelText(d, sel);
    const key = `${d.id}|${spec}`;
    return { ...c, [key]: { dishId: d.id, name: d.name, price: unitPriceOf(d, sel), qty: (c[key]?.qty || 0) + 1, note: c[key]?.note || '', spec, sel: sel || undefined } };
  });
  // 带规格的菜先弹选择；没规格的直接进购物车
  const tapDish = (d) => {
    if (d.soldOut) return;
    if (hasSpecs(d)) {
      const sel = Object.fromEntries(dishSpecs(d).map((g) => [g.name, g.opts[0]?.n]).filter(([, v]) => v));
      setPickDish({ dish: d, sel });
    } else addLine(d, null);
  };
  const incLine = (key) => setCart((c) => ({ ...c, [key]: { ...c[key], qty: c[key].qty + 1 } }));
  const decLine = (key) => setCart((c) => {
    const it = c[key];
    if (!it) return c;
    if (it.qty <= 1) { const { [key]: _, ...rest } = c; return rest; }
    return { ...c, [key]: { ...it, qty: it.qty - 1 } };
  });
  const setNote = (key, note) => setCart((c) => ({ ...c, [key]: { ...c[key], note } }));

  // ── 语音点菜：引擎走 asr.js 适配器（填了百度 key 走百度，否则浏览器内置 ASR）──
  const startVoice = () => {
    setLive('');
    setSwap(-1);
    setListening(true);
    recRef.current = asrListen({
      onText: setLive,
      onEnd: (text) => {
        setListening(false);
        if (text) setPreview(parseOrderTranscript(text, db.dishes)); // 整理成单子预览，改完才入账
      },
      onError: (code, msg) => {
        setListening(false);
        if (code === 'not-allowed' || code === 'service-not-allowed') alert('麦克风没权限，请在浏览器设置里允许后重试');
        else if (code !== 'unsupported') alert(msg || '识别失败，请重试或直接手点');
      },
    }, db.shop);
  };
  const stopVoice = () => { recRef.current?.(); };

  // 预览行编辑：数量 / 规格 / 换菜 / 删行
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
        const spec = specSelText(d, r.sel);
        const key = `${d.id}|${spec}`;
        n[key] = { dishId: d.id, name: d.name, price: unitPriceOf(d, r.sel), qty: (n[key]?.qty || 0) + r.qty, note: n[key]?.note || '', spec, sel: r.sel || undefined };
      });
      return n;
    });
    setPreview(null);
  };

  const submit = () => {
    if (!lines.length) return;
    const items = lines.map(([, i]) => ({ name: i.name, price: i.price, qty: i.qty, note: i.note || '', spec: i.spec || '' }));
    if (walk) {
      let newId;
      update((d) => { const o = submitOrder(d, { mode: 'walk' }, items, true); newId = o.id; });
      say(`新散单，${items.map((i) => `${i.name}${i.spec || ''}${i.qty}份`).join('，')}`);
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
                <div className="name">
                  {d.name}
                  {hasSpecs(d) && <span className="sub" style={{ marginLeft: 6, fontSize: 12 }}>{dishSpecs(d).map((g) => g.name).join('/')}</span>}
                  {d.soldOut && <span className="pill" style={{ marginLeft: 8 }}>售罄</span>}
                </div>
              </div>
              <span className="price">¥{d.price}{hasSpecs(d) && <span className="sub" style={{ fontSize: 11 }}>起</span>}</span>
              {!d.soldOut && (
                cart[`${d.id}|`] ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="sqbtn" onClick={() => decLine(`${d.id}|`)}>−</button>
                    <b>{cart[`${d.id}|`].qty}</b>
                    <button className="sqbtn" onClick={() => tapDish(d)}>＋</button>
                  </div>
                ) : (
                  <button className="sqbtn" onClick={() => tapDish(d)}>＋</button>
                )
              )}
            </div>
          ))}
          {!dishes.length && <div className="sub" style={{ padding: 16 }}>这个分类还没有菜，去「菜品」页添加。</div>}
        </div>
      </div>

      <div className="cartbar">
        {asrAvailable(db.shop) && <button className="micbtn" title="说话点菜" onClick={listening ? stopVoice : startVoice}>🎤</button>}
        <span className="sum">¥{total}</span>
        <span className="sub">{count} 份</span>
        <button className="btn primary" disabled={!lines.length} onClick={submit}>
          提交{add ? '加单' : '下单'}
        </button>
      </div>

      {/* 规格选择：带规格的菜点了先选这个（第一个选项默认选中，直接确认也行） */}
      {pickDish && (
        <div className="mask" onClick={() => setPickDish(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pickDish.dish.name} <span className="sub">¥{unitPriceOf(pickDish.dish, pickDish.sel)}</span></h3>
            {dishSpecs(pickDish.dish).map((g) => (
              <div key={g.name}>
                <div className="label">{g.name}</div>
                <div className="chiprow">
                  {g.opts.map((o) => (
                    <button key={o.n} className={pickDish.sel[g.name] === o.n ? 'chip on' : 'chip'}
                            onClick={() => setPickDish((p) => ({ ...p, sel: { ...p.sel, [g.name]: o.n } }))}>
                      {o.n}{o.d ? ` ${o.d > 0 ? '+' : ''}${o.d}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mfoot">
              <button className="btn" onClick={() => setPickDish(null)}>取消</button>
              <button className="btn primary" onClick={() => { addLine(pickDish.dish, pickDish.sel); setPickDish(null); }}>加入购物车</button>
            </div>
          </div>
        </div>
      )}

      {/* 正在听：实时转写上屏，说完停顿自动整理；点任意处提前结束 */}
      {listening && (
        <div className="mask" onClick={stopVoice}>
          <div className="listen">
            <div className="micbig">🎤</div>
            <div className="ltext">{asrLive(db.shop) ? (live || '请说话…') : '正在听…'}</div>
            <div className="sub" style={{ color: '#fff' }}>例如「羊肉串二十串中辣可乐两瓶」<br />说完停顿自动整理，点屏幕任意处结束</div>
          </div>
        </div>
      )}

      {/* 单子预览：识别不一定准，改到对为止（数量加减 / 规格点选 / 点菜名换菜 / 删行） */}
      {preview && (
        <div className="mask" onClick={() => setPreview(null)}>
          <div className="modal" style={{ width: '92%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>🎙 听到的单子（{previewCount} 份）</h3>
            <div className="sub" style={{ marginBottom: 4 }}>原话：{preview.text || '（空）'}</div>
            {preview.items.map((r, i) => {
              const d = db.dishes.find((x) => x.id === r.dishId);
              return (
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
                  {d && hasSpecs(d) && (
                    <div style={{ padding: '4px 0' }}>
                      {dishSpecs(d).map((g) => (
                        <div key={g.name} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0' }}>
                          <span className="sub" style={{ fontSize: 12 }}>{g.name}</span>
                          {g.opts.map((o) => (
                            <button key={o.n} className={r.sel?.[g.name] === o.n ? 'chip sm on' : 'chip sm'}
                                    onClick={() => editRow(i, { sel: { ...r.sel, [g.name]: o.n } })}>{o.n}</button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {swap === i && (
                    <div className="vswap">
                      {db.dishes.filter((x) => !x.soldOut).map((x) => (
                        <div className="row" key={x.id} onClick={() => { editRow(i, { dishId: x.id, name: x.name, fuzzy: false, sel: null, spec: undefined }); setSwap(-1); }}>
                          <div className="grow name">{x.name}</div>
                          <span className="price">¥{x.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
            {lines.map(([key, i]) => (
              <div key={key} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="grow">
                    <b>{i.name}</b>{i.spec && <span className="sub"> · {i.spec}</span>} <span className="sub">¥{i.price}</span>
                  </div>
                  <button className="sqbtn" onClick={() => decLine(key)}>−</button>
                  <b>{i.qty}</b>
                  <button className="sqbtn" onClick={() => incLine(key)}>＋</button>
                  <button className="sqbtn del" onClick={() => setCart((c) => { const { [key]: _, ...rest } = c; return rest; })}>✕</button>
                </div>
                <input className="f" placeholder="备注：不要辣、多放蒜…" value={i.note}
                       onChange={(e) => setNote(key, e.target.value)} style={{ marginTop: 6 }} />
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
