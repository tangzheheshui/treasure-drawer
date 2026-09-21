import React, { useState } from 'react';
import { activeOrder, orderTotal, unservedCount, hasCall, markServed, serveAll, removeItem, clearTable, answerCall } from '../store.js';
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
  const call = hasCall(db, tableNo);

  const tapServe = (item) => {
    if (item.served) return;
    update((d) => markServed(d, order.id, item.id));
    if (unserved - item.qty === 0) say(`${tableNo}号桌取餐`); // 最后一份出餐 → 叫号
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
            <button className="btn primary" onClick={() => update((d) => answerCall(d, tableNo))}>知道了</button>
          </div>
        )}

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b style={{ fontSize: 17 }}>{order.items.length} 项菜品</b>
            {unserved > 0 ? <span className="pill unserved" style={{ marginLeft: 8 }}>未出 {unserved} 份</span>
                          : <span className="pill served" style={{ marginLeft: 8 }}>已全部出餐</span>}
            <button className="mini ok" style={{ marginLeft: 'auto' }} disabled={!unserved} onClick={serveEverything}>一键全出</button>
          </div>
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
              {unserved > 0 ? <b style={{ color: 'var(--danger)' }}>还有 {unserved} 份未出餐！</b> : '所有菜品已出餐。'}
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
