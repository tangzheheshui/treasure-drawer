import React, { useState } from 'react';
import { activeOrder, orderTotal, paidTotal, dueTotal, dueText, unservedCount, hasCall, markServed, unserveItem, serveAll, removeItem, clearTable, payBill, undoLastPayment } from '../store.js';
import { answerRemote } from '../sync.js';
import { say } from '../voice.js';

export default function Detail({ db, update, tableNo, nav }) {
  const order = activeOrder(db, tableNo);
  const [askClear, setAskClear] = useState(false);
  const [delId, setDelId] = useState(null);

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
  const unserved = unservedCount(order);
  const paid = paidTotal(order);
  const due = dueTotal(order);
  const call = hasCall(db, tableNo);

  // 点一下标出餐，再点一下撤销（出错了能撤回）；最后一份出餐 → 叫号
  const tapServe = (item) => {
    if (item.served) {
      update((d) => unserveItem(d, order.id, item.id));
      return;
    }
    update((d) => markServed(d, order.id, item.id));
    if (unserved - item.qty === 0) say(`${tableNo}号桌取餐`);
  };
  const serveEverything = () => {
    if (!unserved) return;
    update((d) => serveAll(d, order.id));
    say(`${tableNo}号桌取餐`);
  };
  const doClear = () => {
    update((d) => clearTable(d, tableNo));
    setAskClear(false);
    nav('#/tables');
  };

  return (
    <>
      <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 返回</button>{tableNo}号桌 订单</div>
      <div className="page">
        {call && (
          <div className="card" style={{ border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="grow"><b style={{ color: 'var(--danger)' }}>🔔 该桌呼叫中</b><div className="sub">纸巾/加料/结账等请求</div></div>
            <button className="btn primary" onClick={() => answerRemote(db, tableNo)}>知道了</button>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b style={{ fontSize: 17 }}>{order.items.length} 项菜品</b>
            {unserved > 0 ? <span className="pill unserved" style={{ marginLeft: 8 }}>未出 {unserved} 份</span>
                          : <span className="pill served" style={{ marginLeft: 8 }}>已全部出餐</span>}
            <button className="mini ok" style={{ marginLeft: 'auto' }} disabled={!unserved} onClick={serveEverything}>一键全出</button>
          </div>
          <div className="sub" style={{ marginTop: 4 }}>点菜名标出餐；点错了再点一下就撤销。</div>
          <div style={{ marginTop: 6 }}>
            {order.items.map((i) => (
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
          <div className="total-line"><span>合计（现金/扫码自收）</span><b>¥{total}</b></div>

          {/* 收款：可分次结（加菜后再结一笔），误记可撤销最后一笔；多收提示找零 */}
          <div className="total-line">
            <span>已收 <b style={{ color: 'var(--ok)' }}>¥{paid}</b>
              {due > 0 && <span> / 待收 <b style={{ color: 'var(--danger)' }}>¥{due}</b></span>}
              {paid > 0 && due === 0 && <span className="pill served" style={{ marginLeft: 6 }}>已收齐</span>}
              {due < 0 && <span className="pill unserved" style={{ marginLeft: 6 }}>多收 ¥{-due} 记得找零</span>}
            </span>
            <button className="btn ok" style={{ padding: '9px 16px' }} disabled={due <= 0}
                    onClick={() => update((d) => payBill(d, order.id, due))}>
              {due > 0 ? (paid > 0 ? `再结一笔 ¥${due}` : `结一笔 ¥${due}`) : '已收齐'}
            </button>
          </div>
          {(order.payments || []).length > 0 && (
            <div className="sub" style={{ marginTop: 6 }}>
              {(order.payments || []).map((p, k) => (
                <span key={k} style={{ marginRight: 10 }}>
                  {new Date(p.at).toTimeString().slice(0, 5)} 收 ¥{p.amount}
                  {k === order.payments.length - 1 && (
                    <button className="mini" style={{ marginLeft: 6, padding: '3px 8px' }}
                            onClick={() => update((d) => undoLastPayment(d, order.id))}>撤销</button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

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
              {due > 0 ? <b style={{ color: 'var(--danger)' }}>还有 ¥{due} 没收！</b>
                : due < 0 ? <b style={{ color: 'var(--warn)' }}>多收了 ¥{-due}，记得找零。</b>
                : <b style={{ color: 'var(--ok)' }}>已收齐 ¥{paid}。</b>}
              {unserved > 0 && <div>还有 {unserved} 份未出餐！</div>}
              清台后订单归档，桌号释放给下一桌。
            </div>
            <div className="mfoot">
              <button className="btn" onClick={() => setAskClear(false)}>再想想</button>
              <button className="btn warn" onClick={doClear}>确认清台</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
