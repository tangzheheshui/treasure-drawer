import React from 'react';
import { tableState, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, walkOrders } from '../store.js';
import { answerRemote } from '../sync.js';

const ST_NAME = { idle: '空闲', dining: '用餐中', pending: '待清台' };

// 经营层工作台：桌子 + 流动订单 两大部分（经营方式决定显示哪几块）
export default function Tables({ db, update, nav, onAdmin }) {
  const shopMode = db.shop.mode || 'mix'; // table | walk | mix
  const nos = Array.from({ length: db.shop.tableCount }, (_, i) => i + 1);
  const walks = walkOrders(db);
  const showTables = shopMode !== 'walk';
  const showWalk = shopMode !== 'table';

  return (
    <>
      <div className="nav">{db.shop.name || '摊主点单'}<button className="act ghost" onClick={onAdmin}>管理</button></div>
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

        {/* ── 模拟顾客（已按要求移除） ── */}
      </div>
    </>
  );
}
