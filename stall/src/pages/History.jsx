import React, { useState } from 'react';
import { orderTotal, orderItems, orderCost, ordersBetween, dayStartTs, stockValue, todayMoves, lowMats, paidTotal, dueText } from '../store.js';

// 统计：只留摊主每天真会看的五块（一句话：今天赚了多少、花了多少、还剩多少、什么卖得好、什么该补货）。
// 同比环比 / 历史极值 / 周月年粒度 / 采购价走势 → 记在 docs/notes.md「以后要做」。
export default function History({ db }) {
  const [range, setRange] = useState(7);
  const t0 = dayStartTs(0), t1 = dayStartTs(1); // 今天零点 ~ 明天零点

  // ── 今日概览 ──
  const today = ordersBetween(db, t0, t1);
  const revenue = today.reduce((s, o) => s + orderTotal(o), 0);
  const cost = today.reduce((s, o) => s + orderCost(o), 0);
  const profit = revenue - cost;
  const avg = today.length ? Math.round((revenue / today.length) * 100) / 100 : 0;
  const inSpend = todayMoves(db).filter((m) => m.type === 'in').reduce((s, m) => s + m.qty * (m.price || 0), 0);
  const inQtyToday = todayMoves(db).filter((m) => m.type === 'in').reduce((s, m) => s + m.qty, 0);
  const useQtyToday = todayMoves(db).filter((m) => m.type === 'use').reduce((s, m) => s + m.qty, 0);
  const diffMoves = todayMoves(db).filter((m) => m.type === 'count' && m.diff);
  const low = lowMats(db);
  const value = stockValue(db);

  // ── 近 N 天趋势 ──
  const days = Array.from({ length: range }, (_, k) => {
    const from = dayStartTs(k - (range - 1)), to = dayStartTs(k - (range - 1) + 1);
    const list = ordersBetween(db, from, to);
    const rev = list.reduce((s, o) => s + orderTotal(o), 0);
    const c = list.reduce((s, o) => s + orderCost(o), 0);
    return { label: `${new Date(from).getMonth() + 1}/${new Date(from).getDate()}`, rev, cost: c, profit: rev - c };
  });
  const maxRev = Math.max(...days.map((d) => d.rev), 1);

  // ── 菜品排行（近 N 天）──
  const rankOrders = ordersBetween(db, dayStartTs(-(range - 1)));
  const stat = {};
  rankOrders.forEach((o) => orderItems(o).forEach((i) => {
    const s = stat[i.name] || (stat[i.name] = { qty: 0, sales: 0, margin: 0 });
    s.qty += i.qty; s.sales += i.price * i.qty; s.margin += (i.price - (i.cost || 0)) * i.qty;
  }));
  const top = Object.entries(stat).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  const worstQty = top.length ? top[top.length - 1][1].qty : 0;
  const idle = db.dishes
    .map((d) => ({ name: d.name, price: d.price, qty: stat[d.name]?.qty || 0 }))
    .sort((a, b) => a.qty - b.qty || b.price - a.price)
    .slice(0, 10)
    .filter((d) => d.qty <= worstQty); // 比最畅销的尾巴还少才算滞销
  const highMargin = Object.entries(stat).filter(([, s]) => s.qty > 0).sort((a, b) => b[1].margin - a[1].margin).slice(0, 5);
  const noMargin = Object.entries(stat).filter(([, s]) => s.qty > 0).sort((a, b) => a[1].margin - b[1].margin).slice(0, 5)
    .filter(([, s]) => s.margin <= 0);

  // ── 历史归档（清台订单按天，收款状态一目了然）──
  const closed = db.orders.filter((o) => o.status === 'closed').sort((a, b) => b.closedAt - a.closedAt);
  const byDay = {};
  closed.forEach((o) => {
    const d = new Date(o.closedAt);
    const key = `${d.getMonth() + 1}月${d.getDate()}日`;
    (byDay[key] = byDay[key] || []).push(o);
  });

  return (
    <>
      <div className="nav">统计</div>
      <div className="page">
        <div className="card">
          <b>今日概览</b>
          <div className="tiles">
            <div className="tile"><div className="sub">营业额</div><b>¥{revenue}</b></div>
            <div className="tile"><div className="sub">订单数</div><b>{today.length}</b></div>
            <div className="tile"><div className="sub">客单价</div><b>¥{avg}</b></div>
            <div className="tile"><div className="sub">今日毛利</div><b style={{ color: profit >= 0 ? 'var(--ok)' : 'var(--danger)' }}>¥{Math.round(profit * 100) / 100}</b></div>
            <div className="tile"><div className="sub">入库支出</div><b>¥{Math.round(inSpend * 100) / 100}</b></div>
            <div className="tile"><div className="sub">库存结余</div><b>¥{Math.round(value * 100) / 100}</b></div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>毛利 = 营业额 − 菜品成本（按菜单里填的成本价算，没填的菜不计）</div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b>库存日报</b>
            <span className="sub" style={{ marginLeft: 'auto' }}>入库 {inQtyToday} · 用量 {Math.round(useQtyToday * 100) / 100}</span>
          </div>
          <div className="sub">
            今日入库支出 ¥{Math.round(inSpend * 100) / 100} · 当前库存结余 ¥{Math.round(value * 100) / 100}
            {low.length > 0 && <> · <b style={{ color: 'var(--danger)' }}>该补货：{low.map((m) => m.name).join('、')}</b></>}
          </div>
          {diffMoves.length > 0 && (
            <div className="sub" style={{ marginTop: 6 }}>
              盘点差异：{diffMoves.map((m) => `${m.matName} ${m.diff > 0 ? '+' : ''}${Math.round(m.diff * 100) / 100}${m.unit}`).join('，')}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b>菜品排行</b>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {[7, 30].map((r) => (
                <button key={r} className={`mini ${range === r ? 'ok' : ''}`} onClick={() => setRange(r)}>近{r}天</button>
              ))}
            </span>
          </div>
          <div className="sub">畅销 Top（销量 / 销售额 / 毛利）</div>
          {top.map(([name, s]) => (
            <div className="row" key={name}>
              <div className="grow name" style={{ fontSize: 15 }}>{name}</div>
              <span className="sub">×{s.qty} · ¥{s.sales} · 毛 ¥{Math.round(s.margin * 100) / 100}</span>
            </div>
          ))}
          {!top.length && <div className="sub" style={{ padding: 6 }}>这段时间还没有清台的订单。</div>}
          {top.length > 0 && idle.length > 0 && (
            <>
              <div className="sub" style={{ marginTop: 10 }}>卖不动（考虑下架或促销）</div>
              {idle.map((d) => (
                <div className="row" key={d.name}>
                  <div className="grow name" style={{ fontSize: 15, color: 'var(--sub)' }}>{d.name}</div>
                  <span className="sub">{d.qty ? `仅 ×${d.qty}` : '近' + range + '天 0 单'} · ¥{d.price}</span>
                </div>
              ))}
            </>
          )}
          {highMargin.length > 0 && (
            <div className="sub" style={{ marginTop: 10 }}>
              最赚钱：{highMargin.map(([n, s]) => `${n} 毛¥${Math.round(s.margin * 100) / 100}`).join('，')}
              {noMargin.length > 0 && <div style={{ color: 'var(--danger)' }}>不赚钱：{noMargin.map(([n]) => n).join('，')}</div>}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b>趋势</b>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {[7, 30].map((r) => (
                <button key={r} className={`mini ${range === r ? 'ok' : ''}`} onClick={() => setRange(r)}>近{r}天</button>
              ))}
            </span>
          </div>
          {days.map((d) => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span className="sub" style={{ width: 40 }}>{d.label}</span>
              <span style={{ flex: 1, height: 10, background: '#e8eaee', borderRadius: 99, overflow: 'hidden', display: 'block' }}>
                <span style={{ display: 'block', width: `${Math.round((d.rev / maxRev) * 100)}%`, height: '100%', background: 'var(--brand)' }} />
              </span>
              <span style={{ width: 64, textAlign: 'right' }}>¥{d.rev}</span>
              <span className="sub" style={{ width: 70, textAlign: 'right' }}>利 ¥{Math.round(d.profit * 100) / 100}</span>
            </div>
          ))}
          <div className="sub" style={{ marginTop: 6 }}>条形 = 营业额；利润 = 营业额 − 菜品成本（历史订单按当时快照成本算，更早的订单可能没记成本）</div>
        </div>

        <div className="card">
          <b>历史订单</b>
          {Object.entries(byDay).map(([day, list]) => (
            <div key={day} style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
              <b style={{ fontSize: 15 }}>{day}</b>
              {list.map((o) => {
                const t = dueText(o);
                const color = t.cls === 'danger' ? 'var(--danger)' : 'var(--ok)';
                return (
                  <div key={o.id} style={{ display: 'flex', marginTop: 6 }}>
                    <b className="grow" style={{ fontSize: 14 }}>{o.tableNo}号桌</b>
                    <span className="pill" style={{ color, background: paidTotal(o) > 0 ? undefined : '#e8eaee' }}>{t.text}</span>
                    <span className="sub" style={{ marginLeft: 8 }}>{new Date(o.closedAt).toTimeString().slice(0, 5)}</span>
                    <b style={{ marginLeft: 12 }}>¥{orderTotal(o)}</b>
                  </div>
                );
              })}
            </div>
          ))}
          {!closed.length && <div className="sub" style={{ padding: 8 }}>还没有已清台的订单。</div>}
        </div>
      </div>
    </>
  );
}
