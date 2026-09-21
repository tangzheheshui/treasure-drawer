import React from 'react';
import { orderTotal, orderItems } from '../store.js';

// 结账后的小票：浏览器打印（可接热敏打印机的打印服务），也顺手当收据凭据
export default function Receipt({ db, orderId, nav }) {
  const o = db.orders.find((x) => x.id === orderId);
  if (!o) {
    return (
      <>
        <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 完成</button>小票</div>
        <div className="page"><div className="card"><div className="sub">订单不存在或已被清空。</div></div></div>
      </>
    );
  }
  const items = orderItems(o);

  return (
    <>
      <div className="nav no-print"><button className="back" onClick={() => nav('#/tables')}>← 完成</button>小票</div>
      <div className="page">
        <div className="receipt">
          <div className="r-shop">{db.shop.name}</div>
          <div className="r-line">{o.mode === 'walk' ? `单号：${o.code || '散客'}` : `桌号：${o.tableNo}号桌${o.guests ? `（${o.guests}人）` : ''}`}</div>
          <div className="r-line">时间：{new Date(o.closedAt || Date.now()).toLocaleString('zh-CN')}</div>
          <div className="r-div">--------------------------------</div>
          {items.map((i) => (
            <div className="r-item" key={i.id}>
              <span>{i.name} ×{i.qty}</span>
              <span>¥{i.price * i.qty}</span>
            </div>
          ))}
          <div className="r-div">--------------------------------</div>
          <div className="r-item r-total"><span>合计</span><span>¥{orderTotal(o)}</span></div>
          <div className="r-line">收款：已收清（线下）</div>
          <div className="r-thanks">谢谢惠顾，欢迎再来！</div>
        </div>
        <button className="btn primary block no-print" style={{ marginTop: 12 }} onClick={() => window.print()}>🖨 打印小票</button>
        <div className="sub no-print" style={{ textAlign: 'center', marginTop: 8 }}>在打印弹窗里选「另存为 PDF」也可留存。</div>
      </div>
    </>
  );
}
