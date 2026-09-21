import React, { useEffect, useState } from 'react';
import { activeOrder, batchTotal, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, markServed, unserveItem, serveAll, removeItem, clearTable, toggleBatchSettled } from '../store.js';
import { answerRemote } from '../sync.js';
import { say } from '../voice.js';

export default function Detail({ db, update, tableNo, nav }) {
  const order = activeOrder(db, tableNo);
  const [askClear, setAskClear] = useState(false);
  const [delId, setDelId] = useState(null);
  const [fold, setFold] = useState({}); // batchId -> 是否收起；默认已结账的笔收起

  // 呼叫进桌即消（PRD：点桌号卡片提醒消失）
  useEffect(() => {
    if (hasCall(db, tableNo)) answerRemote(db, tableNo);
  }, [tableNo]);

  if (!order) {
    return (
      <>
        <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 返回</button>{tableNo}号桌</div>
        <div className="page">
          <div className="card"><b>{tableNo}号桌当前没有订单</b><div className="sub">可能已清台。</div>
            <button className="btn primary" style={{ marginTop: 10 }} onClick={() => nav(`#/order/${tableNo}`)}>去点单</button></div>
        </div>
      </>
    );
  }

  const total = orderTotal(order);
  const paid = paidTotal(order);
  const due = dueTotal(order);
  const unserved = unservedCount(order);
  const batches = order.batches || [];
  const isFolded = (b) => fold[b.id] ?? b.settled; // 已结账默认收起，未结默认展开

  const tapServe = (item) => {
    if (item.served) {
      update((d) => unserveItem(d, order.id, item.id));
      return;
    }
    update((d) => markServed(d, order.id, item.id));
    if (unserved - item.qty === 0) say(`${tableNo}号桌取餐`);
  };

  return (
    <>
      <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 返回</button>{tableNo}号桌 订单</div>
      <div className="page">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b style={{ fontSize: 17 }}>{batches.length} 笔 · {total} 元</b>
            {unserved > 0 ? <span className="pill unserved" style={{ marginLeft: 8 }}>未出 {unserved} 份</span>
                          : <span className="pill served" style={{ marginLeft: 8 }}>已全部出餐</span>}
            <button className="mini ok" style={{ marginLeft: 'auto' }} disabled={!unserved} onClick={() => { update((d) => serveAll(d, order.id)); say(`${tableNo}号桌取餐`); }}>一键全出</button>
          </div>
          <div className="sub" style={{ marginTop: 4 }}>点菜名标出餐，再点撤销；每笔可单独结账/取消。</div>
          <div className="total-line">
            <span>已结 <b style={{ color: 'var(--ok)' }}>¥{paid}</b>
              {due > 0 && <span> / 待结 <b style={{ color: 'var(--danger)' }}>¥{due}</b></span>}
            </span>
            <span style={dueText(order).cls === 'danger' ? { color: 'var(--danger)', fontWeight: 700 } : { color: 'var(--ok)', fontWeight: 700 }}>{dueText(order).text}</span>
          </div>
        </div>

        {batches.map((b, idx) => {
          const folded = isFolded(b);
          return (
            <div className="card" key={b.id} style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b onClick={() => setFold((f) => ({ ...f, [b.id]: !folded }))} style={{ cursor: 'pointer' }}>
                  第{idx + 1}笔 <span className="fold-arrow">{folded ? '▸' : '▾'}</span>
                </b>
                <span className="sub">{new Date(b.at).toTimeString().slice(0, 5)} · {b.items.reduce((s, i) => s + i.qty, 0)} 份</span>
                {b.settled
                  ? <span className="pill served bdone">已结账 ¥{batchTotal(b)}</span>
                  : <span className="pill unserved">未结 ¥{batchTotal(b)}</span>}
                <button
                  className={`mini ${b.settled ? '' : 'ok'}`}
                  style={{ marginLeft: 'auto' }}
                  onClick={() => update((d) => toggleBatchSettled(d, order.id, b.id))}
                >{b.settled ? '取消标记' : '标记结账'}</button>
              </div>
              {!folded && (
                <div style={{ marginTop: 2 }}>
                  {b.items.map((i) => (
                    <div className="row" key={i.id}>
                      <div className="grow" onClick={() => tapServe(i)} style={{ cursor: 'pointer' }}>
                        <div className={`name ${i.served ? 'dead' : ''}`}>
                          {i.name} <span className="sub">×{i.qty}</span>
                          {i.served ? <span className="pill served" style={{ marginLeft: 8 }}>已出餐</span>
                                    : <span className="pill unserved" style={{ marginLeft: 8 }}>未出</span>}
                        </div>
                        {i.note && <div className="sub">备注：{i.note}</div>}
                      </div>
                      <span className="price">¥{i.price * i.qty}</span>
                      <button className="sqbtn del" onClick={() => setDelId(i.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => nav(`#/order/${tableNo}?add=1`)}>＋ 加菜</button>
          <button className="btn warn" style={{ flex: 1 }} onClick={() => setAskClear(true)}>结账并清台</button>
        </div>
      </div>

      {delId && (
        <div className="mask" onClick={() => setDelId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>退掉这道菜？</h3>
            <div className="sub">账单会自动更新，请和顾客确认。</div>
            <div className="mfoot">
              <button className="btn" onClick={() => setDelId(null)}>取消</button>
              <button className="btn danger" onClick={() => { update((d) => removeItem(d, order.id, delId)); setDelId(null); }}>退单</button>
            </div>
          </div>
        </div>
      )}

      {askClear && (
        <div className="mask" onClick={() => setAskClear(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{tableNo}号桌消费 {total} 元，确认清台？</h3>
            <div className="sub">
              {due > 0 ? <>未结的 <b>¥{due}</b> 会一并记为<b>已结账</b>。</> : <b style={{ color: 'var(--ok)' }}>每笔都已结账，共 ¥{paid}。</b>}
              {unserved > 0 && <div>还有 {unserved} 份未出餐！</div>}
              清台后订单归档，桌号释放给下一桌。
            </div>
            <div className="mfoot">
              <button className="btn" onClick={() => setAskClear(false)}>再想想</button>
              <button className="btn warn" onClick={() => { update((d) => clearTable(d, tableNo)); setAskClear(false); nav('#/tables'); }}>确认清台</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
