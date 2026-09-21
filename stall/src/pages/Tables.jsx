import React, { useState } from 'react';
import { tableState, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, activeOrder, submitOrder, sayItemsText, callTable, answerCall } from '../store.js';
import { answerRemote } from '../sync.js';
import { say } from '../voice.js';

const ST_NAME = { idle: '空闲', dining: '用餐中', pending: '待清台' };

export default function Tables({ db, update, nav, onAdmin }) {
  const [demo, setDemo] = useState(false);
  const nos = Array.from({ length: db.shop.tableCount }, (_, i) => i + 1);

  const randomItems = () => {
    const pool = db.dishes.filter((d) => !d.soldOut);
    const n = 2 + Math.floor(Math.random() * 3);
    const picked = [];
    for (let i = 0; i < n; i++) {
      const d = pool[Math.floor(Math.random() * pool.length)];
      const ex = picked.find((p) => p.name === d.name);
      if (ex) ex.qty++;
      else picked.push({ name: d.name, price: d.price, qty: 1, note: '' });
    }
    return picked;
  };

  const demoNew = () => {
    const idle = nos.filter((no) => !activeOrder(db, no));
    if (!idle.length) return;
    const no = idle[Math.floor(Math.random() * idle.length)];
    const items = randomItems();
    update((d) => submitOrder(d, no, items, false));
    say(sayItemsText(no, items, ''));
    setDemo(true);
  };
  const demoAdd = () => {
    const busy = nos.filter((no) => activeOrder(db, no));
    if (!busy.length) return;
    const no = busy[Math.floor(Math.random() * busy.length)];
    const items = randomItems();
    update((d) => submitOrder(d, no, items, true));
    say(sayItemsText(no, items, '加单'));
    setDemo(true);
  };
  const demoCall = () => {
    const no = nos[Math.floor(Math.random() * nos.length)];
    update((d) => callTable(d, no));
    say(`${no}号桌呼叫`);
    setDemo(true);
  };

  return (
    <>
      <div className="nav">{db.shop.name || '摊主点单'}
        <button className="act ghost" onClick={onAdmin}>管理</button>
      </div>
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
                      {unservedCount(order) > 0 && <span>未出 {unservedCount(order)} 份</span>}
                      {paidTotal(order) > 0 && <span style={{ color: due.cls === 'danger' ? 'var(--danger)' : due.cls === 'warn' ? 'var(--warn)' : 'var(--ok)' }}>{due.text}</span>}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <b>模拟顾客</b>
          <div className="sub" style={{ margin: '4px 0 10px' }}>顾客 H5 未接前的演示入口：模拟新单、加单、呼叫三条实时路径</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="mini ok" onClick={demoNew}>随机新单</button>
            <button className="mini ok" onClick={demoAdd}>随机加单</button>
            <button className="mini" onClick={demoCall}>随机呼叫</button>
          </div>
          {demo && <div className="sub" style={{ marginTop: 8 }}>听到播报了吗？对应桌号卡片有变化。</div>}
        </div>
      </div>
    </>
  );
}
