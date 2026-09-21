import React, { useEffect, useState } from 'react';
import { activeOrder, batchTotal, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, markServed, unserveItem, serveAll, removeItem, clearById, toggleBatchSettled, walkOrders } from '../store.js';
import { answerRemote } from '../sync.js';
import { say } from '../voice.js';

// 订单详情：桌单（#/table/:no）与散单（#/o/:id）通用
export default function Detail({ db, update, orderId, tableNo, nav }) {
  const order = orderId ? db.orders.find((o) => o.id === orderId) : activeOrder(db, tableNo);
  const [askClear, setAskClear] = useState(false);
  const [delId, setDelId] = useState(null);
  const [fold, setFold] = useState({}); // batchId -> 是否收起；默认已结账的笔收起
  const isWalk = order ? order.mode === 'walk' : false;
  const walkIdx = order && isWalk ? walkOrders(db).findIndex((o) => o.id === order.id) + 1 : 0;
  const label = order ? (isWalk ? `散客单 ${order.code || `第 ${walkIdx} 单`}` : `${tableNo ?? order.tableNo}号桌`) : '';
  const eatLabel = order ? (isWalk ? '散客单' : `${tableNo ?? order.tableNo}号桌`) : '';

  // 呼叫进桌即消（PRD：点桌号卡片提醒消失）
  useEffect(() => {
    if (!orderId && tableNo && hasCall(db, tableNo)) answerRemote(db, tableNo);
  }, [tableNo, orderId]);

  if (!order) {
    return (
      <>
        <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 返回</button>{label || '订单'}</div>
        <div className="page">
          <div className="card"><b>当前没有进行中的订单</b><div className="sub">可能已结账。</div>
            <button className="btn primary" style={{ marginTop: 10 }} onClick={() => nav(`#/order/${tableNo ?? 0}`)}>去点单</button></div>
        </div>
      </>
    );
  }

  const total = orderTotal(order);
  const unserved = unservedCount(order);
  const paid = paidTotal(order);
  const due = dueTotal(order);
  const call = !isWalk && hasCall(db, tableNo);
  const batches = order.batches || [];

  // 点菜名标出餐，再点撤销；最后一份出餐 → 叫号
  const tapServe = (item) => {
    if (item.served) {
      update((d) => unserveItem(d, order.id, item.id));
      return;
    }
    update((d) => markServed(d, order.id, item.id));
    if (unserved - item.qty === 0) say(isWalk ? '散单出餐' : `${tableNo}号桌取餐`);
  };
  const serveEverything = () => {
    if (!unserved) return;
    update((d) => serveAll(d, order.id));
    say(isWalk ? '散单出餐' : `${tableNo}号桌取餐`);
  };

  return (
    <>
      <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 返回</button>{eatLabel} 订单</div>
      <div className="page">
        {call && (
          <div className="card" style={{ border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="grow"><b style={{ color: 'var(--danger)' }}>🔔 该桌呼叫中</b><div className="sub">纸巾/加料/结账等请求</div></div>
            <button className="btn primary" onClick={() => answerRemote(db, tableNo)}>知道了</button>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <b style={{ fontSize: 17 }}>{batches.length} 笔 · {total} 元{order.guests ? ` · ${order.guests}人` : ''}</b>
            {unserved > 0 ? <span className="pill unserved">未出 {unserved} 份</span>
                          : <span className="pill served">已全部出餐</span>}
            <button className="mini ok" style={{ marginLeft: 'auto' }} disabled={!unserved} onClick={serveEverything}>一键全出</button>
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
          const folded = fold[b.id] ?? b.settled;
          return (
            <div className="card" key={b.id} style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
          {!isWalk && <button className="btn primary" style={{ flex: 1 }} onClick={() => nav(`#/order/${tableNo}?add=1`)}>＋ 加菜</button>}
          <button className="btn warn" style={{ flex: 1 }} onClick={() => setAskClear(true)}>{isWalk ? '结账完成' : '结账并清台'}</button>
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
            <h3>{eatLabel}消费 {total} 元，确认结账？</h3>
            <div className="sub">
              {due > 0 ? <>未结的 <b>¥{due}</b> 会一并记为<b>已结账</b>。</> : <b style={{ color: 'var(--ok)' }}>每笔都已结账，共 ¥{paid}。</b>}
              {unserved > 0 && <div style={{ color: 'var(--danger)' }}>还有 {unserved} 份未出餐！</div>}
              结账后{isWalk ? '散单归档' : '订单归档，桌号释放给下一桌'}，可直接打印小票。
            </div>
            <div className="mfoot">
              <button className="btn" onClick={() => setAskClear(false)}>再想想</button>
              <button className="btn warn" onClick={() => { const oid = order.id; update((d) => clearById(d, oid)); setAskClear(false); nav(`#/receipt/${oid}`); }}>确认结账</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
