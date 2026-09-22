import React, { useEffect, useRef, useState } from 'react';
import { tableState, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, walkOrders, submitOrder, sayItemsText, specSelText, unitPriceOf } from '../store.js';
import { answerRemote } from '../sync.js';
import { asrAvailable, asrListen } from '../asr.js';
import { parseOrderTranscript } from '../parseOrder.js';
import { say } from '../voice.js';

const ST_NAME = { idle: '空闲', dining: '用餐中', pending: '待清台' };

// 经营层工作台：桌子 + 流动订单 + 底部居中「按住说话」语音入口
export default function Tables({ db, update, nav, onAdmin }) {
  const shopMode = db.shop.mode || 'mix'; // table | walk | mix
  const nos = Array.from({ length: db.shop.tableCount }, (_, i) => i + 1);
  const walks = walkOrders(db);
  const showTables = shopMode !== 'walk';
  const showWalk = shopMode !== 'table';

  // ── 语音点菜：按住说 → 松手识别 → 预览改单 → 选桌 ──
  // 手势铁律：**按住期间绝不卸载按钮**。一按就卸载 = 把手指的触摸目标从 DOM 摘掉，
  // 触摸事件从此派发到「已脱离文档的节点」，冒不到 document，任何松手监听都收不到
  // ——真机松手必卡死的根。配合 Pointer 事件 + setPointerCapture：按下瞬间把指针
  // 捕获到按钮上，之后蒙层盖上、手指挪动，pointerup 都保证派回按钮本体。
  const [phase, setPhase] = useState(null);        // null | 'listen'（正在听）| 'recognize'（识别中）
  const [vol, setVol] = useState(0);
  const [live, setLive] = useState('');            // 分段识别的实时粗文字
  const [preview, setPreview] = useState(null);   // { text, items:[{dishId,name,qty,fuzzy,sel}], leftover }
  const [pickTable, setPickTable] = useState(null); // 预览确认后待选桌的 items
  const recRef = useRef(null);

  const startVoice = () => {
    if (!db.shop.pbId) {
      alert('请先到「设置 → 联机」登录，登录后即可语音点菜');
      return;
    }
    setVol(0);
    setLive('');
    setPhase('listen');
    recRef.current = asrListen({
      onVolume: setVol,
      onText: setLive,
      onEnd: (text) => {
        setPhase(null);
        if (text) setPreview(parseOrderTranscript(text, db.dishes));
        else alert('没听到声音：请确认麦克风权限已允许、麦克风没静音，再按住说一遍');
      },
      onError: (code, msg) => {
        setPhase(null);
        if (code === 'not-allowed' || code === 'service-not-allowed') alert('麦克风没权限，请在浏览器设置里允许后重试');
        else if (code !== 'unsupported') alert(msg || '识别失败，请重试或直接手点');
      },
      onCancel: () => setPhase(null), // 录音未开始就松手：静默退出
    }, db.shop);
  };
  const stopVoice = () => {
    if (!recRef.current) return;
    setPhase((p) => (p === 'listen' ? 'recognize' : p)); // 松手立即转「识别中」，绝不停在「正在听」
    recRef.current();
    recRef.current = null;
  };

  // 保险带：万一 pointerup 没落到按钮上（怪异 webview），document 上兜一手
  useEffect(() => {
    if (phase !== 'listen') return;
    document.addEventListener('pointerup', stopVoice);
    document.addEventListener('pointercancel', stopVoice);
    return () => {
      document.removeEventListener('pointerup', stopVoice);
      document.removeEventListener('pointercancel', stopVoice);
    };
  }, [phase]);

  const editRow = (i, patch) => setPreview((p) => ({ ...p, items: p.items.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const dropRow = (i) => setPreview((p) => ({ ...p, items: p.items.filter((_, k) => k !== i) }));

  // 预览确认 → 进入选桌
  const buildItems = (rows) => rows.map((r) => {
    const d = db.dishes.find((x) => x.id === r.dishId);
    return { name: d.name, price: unitPriceOf(d, r.sel), qty: r.qty, note: r.note || '', spec: specSelText(d, r.sel), unit: d.unit || '份' };
  });

  const submitTo = (tableNo, items) => {
    update((d) => { submitOrder(d, tableNo, items, false); });
    say(sayItemsText(tableNo, items, ''));
    setPickTable(null);
    nav(`#/table/${tableNo}`);
  };
  const submitWalk = (items) => {
    update((d) => { submitOrder(d, { mode: 'walk' }, items, true); });
    say(`新散单，${items.map((i) => `${i.name}${i.spec || ''}${i.qty}${i.unit || '份'}`).join('，')}`);
    setPickTable(null);
  };

  // 预览确认：话里指定了桌号 → 直接下单；否则弹选桌
  const confirmPreview = () => {
    const rows = preview.items.map((r) => ({ dishId: r.dishId, qty: r.qty, sel: r.sel, note: r.note || '' }));
    const items = buildItems(rows);
    const t = preview.tableNo;
    if (t && t >= 1 && t <= db.shop.tableCount) {
      submitTo(t, items); // 已经说了「X号桌」，不弹选桌
    } else {
      setPickTable(rows);
      setPreview(null);
    }
  };

  return (
    <>
      <div className="nav">{db.shop.name || '摊主点单'}<button className="act ghost" onClick={onAdmin}>后台</button></div>
      <div className="page">
        {db.calls.length > 0 && (
          <div className="card" style={{ borderColor: '#b42318', borderWidth: 1, borderStyle: 'solid' }}>
            <b style={{ color: 'var(--danger)' }}>🔔 呼叫中</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {db.calls.map((c) => (
                <span key={c.tableNo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #f0cfcb', borderRadius: 99, padding: '6px 8px 6px 12px' }}>
                  <b style={{ color: 'var(--danger)' }}>{c.tableNo}号桌</b>
                  <button className="mini" onClick={() => answerRemote(db, c.tableNo)}>消除</button>
                </span>
              ))}
            </div>
            <div className="sub" style={{ marginTop: 8 }}>点「消除」= 已去处理；点桌号卡片 = 进桌看订单（也会自动消除）</div>
          </div>
        )}

        {/* ── 桌子 ── */}
        {showTables && (
          <div className="grid">
            {nos.map((no) => {
              const { state, order } = tableState(db, no);
              const call = hasCall(db, no);
              return (
                <div
                  key={no}
                  className={`tcard ${state} ${call ? 'call' : ''}`}
                  onClick={() => nav(state === 'idle' ? `#/order/${no}` : `#/table/${no}`)}
                >
                  <span className="no">{no}号桌</span>
                  <span className="st">{ST_NAME[state]}</span>
                  {call && (
                    <button
                      className="call-x"
                      onClick={(e) => { e.stopPropagation(); answerRemote(db, no); }}
                    >✕</button>
                  )}
                  {order && (() => {
                    const due = dueText(order);
                    return (
                      <div className="meta">
                        <span className="total">¥{orderTotal(order)}</span>
                        {order.guests > 0 && <span>{order.guests}人</span>}
                        {unservedCount(order) > 0 && <span>未出 {unservedCount(order)} 份</span>}
                        {paidTotal(order) > 0 && <span style={{ color: due.cls === 'danger' ? 'var(--danger)' : due.cls === 'warn' ? 'var(--warn)' : 'var(--ok)' }}>{due.text}</span>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 流动订单 ── */}
        {showWalk && (
          <div className="card" style={{ marginTop: showTables ? 14 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <b>流动订单</b>
              <span className="sub" style={{ marginLeft: 8 }}>{walks.length} 单进行中</span>
              <button className="mini ok" style={{ marginLeft: 'auto' }} onClick={() => nav('#/order/walk')}>＋ 散客新单</button>
            </div>
            <div style={{ marginTop: 6 }}>
              {walks.map((o, i) => {
                const due = dueText(o);
                return (
                  <div className="row" key={o.id} onClick={() => nav(`#/o/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <div className="grow">
                      <div className="name">散客单 {i + 1}{o.code ? <span className="sub"> · 单号 {o.code}</span> : ''}</div>
                      <div className="sub">{unservedCount(o) > 0 ? `未出 ${unservedCount(o)} 份` : '已出齐'}{paidTotal(o) > 0 && dueTotal(o) > 0 ? ` · 待收 ¥${dueTotal(o)}` : ''}</div>
                    </div>
                    <span className="total" style={{ fontSize: 16 }}>¥{orderTotal(o)}</span>
                  </div>
                );
              })}
              {!walks.length && <div className="sub" style={{ padding: 8 }}>还没有散客单，点「＋ 散客新单」。</div>}
            </div>
          </div>
        )}
      </div>

      {/* ── 底部居中「按住说话」大按钮（听/识别期间也不卸载，蒙层盖在上面）── */}
      {asrAvailable(db.shop) && !preview && !pickTable && (
        <button className="voice-btn"
                onPointerDown={(e) => {
                  e.preventDefault(); // 压掉浏览器补发的合成鼠标事件/选中（touchstart 是 passive，preventDefault 无效）
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 无捕获的引擎：按钮常驻不卸载也能收到 up */ }
                  startVoice();
                }}
                onPointerUp={stopVoice}
                onPointerCancel={stopVoice}
                onLostPointerCapture={stopVoice}
                onContextMenu={(e) => e.preventDefault()}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span>按住说话</span>
        </button>
      )}

      {/* 按住说话中 / 松手识别中：蒙层盖住按钮（按钮本体仍在 DOM 里守着这次手势） */}
      {phase && (
        <div className="mask" onContextMenu={(e) => e.preventDefault()}>
          <div className="listen">
            {phase === 'listen' ? (
              <>
                <div className="micbig" style={{ transform: `scale(${1 + Math.min(1, vol * 3) * 0.3})` }}>🎤</div>
                <div className="volmeter"><span style={{ width: `${Math.min(100, vol * 400)}%` }} /></div>
                <div className="ltext">{live || '正在听…'}</div>
                <div className="sub" style={{ color: '#fff' }}>按住说话，松开识别</div>
              </>
            ) : (
              <>
                <div className="micbig">⏳</div>
                <div className="ltext">识别中…</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 单子预览：改到对为止 */}
      {preview && (
        <div className="mask" onClick={() => setPreview(null)}>
          <div className="modal" style={{ width: '92%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>🎙 听到的单子</h3>
            <div className="sub" style={{ marginBottom: 4 }}>原话：{preview.text || '（空）'}</div>
            {preview.items.map((r, i) => {
              const d = db.dishes.find((x) => x.id === r.dishId);
              return (
                <div key={i} style={{ borderBottom: '1px solid var(--line)', padding: '4px 0' }}>
                  <div className="vrow" style={{ borderBottom: 0 }}>
                    <div className="grow">
                      <b>{r.name}</b>
                      {r.fuzzy && <span className="pill warn" style={{ marginLeft: 6 }}>认成了？</span>}
                    </div>
                    <button className="sqbtn" onClick={() => editRow(i, { qty: Math.max(1, r.qty - 1) })}>−</button>
                    <b>{r.qty}<span style={{ fontSize: 12, fontWeight: 400 }}>{d?.unit || '份'}</span></b>
                    <button className="sqbtn" onClick={() => editRow(i, { qty: Math.min(999, r.qty + 1) })}>＋</button>
                    <button className="sqbtn del" onClick={() => dropRow(i)}>✕</button>
                  </div>
                  <input className="f" placeholder="备注：不要辣、多放蒜…" value={r.note || ''}
                         onChange={(e) => editRow(i, { note: e.target.value })} style={{ marginTop: 4 }} />
                </div>
              );
            })}
            {!preview.items.length && <div className="sub" style={{ padding: '8px 0' }}>没听出菜名，再说一遍试试？</div>}
            {preview.leftover && <div className="sub" style={{ color: 'var(--warn)' }}>没对上号：「{preview.leftover}」（对不上就手动加）</div>}
            <div className="mfoot">
              <button className="btn" onClick={() => setPreview(null)}>再说一遍</button>
              <button className="btn primary" disabled={!preview.items.length} onClick={confirmPreview}>确认，选桌</button>
            </div>
          </div>
        </div>
      )}

      {/* 选桌：识别出的单子给哪桌 */}
      {pickTable && (
        <div className="mask" onClick={() => setPickTable(null)}>
          <div className="modal" style={{ width: '92%', maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>这单给哪桌？</h3>
            {showTables && (
              <div className="grid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {nos.map((no) => {
                  const { state } = tableState(db, no);
                  return (
                    <button key={no} className={`tcard pick ${state}`} onClick={() => submitTo(no, buildItems(pickTable))}>
                      <span className="no">{no}号</span>
                      <span className="st">{ST_NAME[state]}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {showWalk && (
              <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => submitWalk(buildItems(pickTable))}>＋ 散客新单</button>
            )}
            <button className="btn block" style={{ marginTop: 8 }} onClick={() => setPickTable(null)}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}
