import React, { useState } from 'react';
import { orderTotal, orderItems, orderCost, ordersBetween, dayStartTs, stockValue, todayMoves, lowMats } from '../store.js';

const DAY = 86400000;
const monthStart = (off) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + off, 1).getTime(); };
const yearStart = () => { const d = new Date(); return new Date(d.getFullYear(), 0, 1).getTime(); };
const RANGES = [
  { key: 'today', label: '今天', from: () => dayStartTs(0) },
  { key: 'd7', label: '近7天', from: () => dayStartTs(-6) },
  { key: 'd30', label: '近30天', from: () => dayStartTs(-29) },
  { key: 'year', label: '今年', from: yearStart },
];
const r1 = (n) => Math.round(n * 100) / 100;

// 折线图：营业额（实线+面积）、毛利（虚线）；跨度大自动按周/月聚合
function Trend({ series }) {
  const W = 350, H = 150, padL = 6, padR = 6, padT = 14, padB = 18;
  if (series.length < 2) return <div className="sub" style={{ padding: 8 }}>数据还不到两天，先攒一攒。</div>;
  const max = Math.max(...series.map((s) => s.rev), 1);
  const x = (i) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const y = (v) => padT + (1 - Math.max(0, v) / max) * (H - padT - padB);
  const line = (key) => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ');
  const area = `${line('rev')} L${x(series.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const step = Math.ceil(series.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150 }}>
      <path d={area} fill="#4e596922" />
      <path d={line('rev')} fill="none" stroke="#4e5969" strokeWidth="2" />
      <path d={line('profit')} fill="none" stroke="#2b7a4b" strokeWidth="1.5" strokeDasharray="4 3" />
      {series.map((s, i) => (
        (i % step === 0 || i === series.length - 1) ? (
          <text key={i} x={x(i)} y={H - 4} fontSize={8} fill="#8a939d" textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>{s.label}</text>
        ) : null
      ))}
      <text x={padL} y={9} fontSize={8} fill="#8a939d">峰值 ¥{r1(max)}</text>
    </svg>
  );
}

// 排行条形（纯 div，手机上轻）
function RankBars({ rows }) {
  const max = Math.max(...rows.map((r) => r.qty), 1);
  return (
    <div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
          <span style={{ width: 68, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.name}</span>
          <span style={{ flex: 1, height: 12, background: '#e8eaee', borderRadius: 99, display: 'block', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${Math.round((r.qty / max) * 100)}%`, height: '100%', background: '#2b7a4b' }} />
          </span>
          <b style={{ fontSize: 13, width: 34, textAlign: 'right' }}>×{r.qty}</b>
        </div>
      ))}
    </div>
  );
}

// 统计：按时间段看生意（今天/近7天/近30天/今年），跨度大自动按周/月聚合。
export default function History({ db }) {
  const [rk, setRk] = useState('d7');
  const def = RANGES.find((r) => r.key === rk);
  const from = def.from(), to = dayStartTs(1);

  // 概览（随时间段）
  const list = ordersBetween(db, from, to);
  const revenue = list.reduce((s, o) => s + orderTotal(o), 0);
  const cost = list.reduce((s, o) => s + orderCost(o), 0);
  const profit = revenue - cost;
  const avg = list.length ? r1(revenue / list.length) : 0;
  const rate = revenue ? Math.round((profit / revenue) * 100) : 0;
  const inSpend = db.moves.filter((m) => m.type === 'in' && m.at >= from && m.at < to).reduce((s, m) => s + m.qty * (m.price || 0), 0);

  // 逐日/周/月序列
  const gran = to - from > 120 * DAY ? '月' : to - from > 45 * DAY ? '周' : '日';
  const series = [];
  if (gran === '日') {
    for (let s = from; s < to; s += DAY) {
      const l = ordersBetween(db, s, s + DAY);
      series.push({ label: `${new Date(s).getMonth() + 1}/${new Date(s).getDate()}`, rev: l.reduce((a, o) => a + orderTotal(o), 0), profit: l.reduce((a, o) => a + orderTotal(o) - orderCost(o), 0) });
    }
  } else if (gran === '周') {
    for (let s = from; s < to; s += 7 * DAY) {
      const l = ordersBetween(db, s, Math.min(s + 7 * DAY, to));
      series.push({ label: `${new Date(s).getMonth() + 1}/${new Date(s).getDate()}`, rev: l.reduce((a, o) => a + orderTotal(o), 0), profit: l.reduce((a, o) => a + orderTotal(o) - orderCost(o), 0) });
    }
  } else {
    let cur = new Date(from); cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    while (cur.getTime() < to) {
      const s = cur.getTime(), e = new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime();
      const l = ordersBetween(db, s, e);
      series.push({ label: `${cur.getMonth() + 1}月`, rev: l.reduce((a, o) => a + orderTotal(o), 0), profit: l.reduce((a, o) => a + orderTotal(o) - orderCost(o), 0) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  // 菜品排行（随时间段）
  const stat = {};
  list.forEach((o) => orderItems(o).forEach((i) => {
    const s = stat[i.name] || (stat[i.name] = { qty: 0, sales: 0, margin: 0 });
    s.qty += i.qty; s.sales += i.price * i.qty; s.margin += (i.price - (i.cost || 0)) * i.qty;
  }));
  const top = Object.entries(stat).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  const worstQty = top.length ? top[top.length - 1][1].qty : 0;
  const idle = db.dishes
    .map((d) => ({ name: d.name, price: d.price, qty: stat[d.name]?.qty || 0 }))
    .sort((a, b) => a.qty - b.qty || b.price - a.price)
    .slice(0, 10)
    .filter((d) => d.qty <= worstQty);
  const highMargin = Object.entries(stat).filter(([, s]) => s.qty > 0).sort((a, b) => b[1].margin - a[1].margin).slice(0, 5);
  const noMargin = Object.entries(stat).filter(([, s]) => s.qty > 0).sort((a, b) => a[1].margin - b[1].margin).slice(0, 5)
    .filter(([, s]) => s.margin <= 0);

  // 库存（当前 + 今日）
  const tm = todayMoves(db);
  const inSpendToday = tm.filter((m) => m.type === 'in').reduce((s, m) => s + m.qty * (m.price || 0), 0);
  const inQtyToday = tm.filter((m) => m.type === 'in').reduce((s, m) => s + m.qty, 0);
  const useQtyToday = tm.filter((m) => m.type === 'use').reduce((s, m) => s + m.qty, 0);
  const diffMoves = tm.filter((m) => m.type === 'count' && m.diff);
  const low = lowMats(db);
  const value = stockValue(db);

  const Chips = () => (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {RANGES.map((r) => (
        <button key={r.key} className={`mini ${rk === r.key ? 'ok' : ''}`} onClick={() => setRk(r.key)}>{r.label}</button>
      ))}
    </span>
  );

  return (
    <>
      <div className="nav">统计</div>
      <div className="page">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b>概览</b>
            <Chips />
          </div>
          <div className="tiles">
            <div className="tile"><div className="sub">营业额</div><b>¥{r1(revenue)}</b></div>
            <div className="tile"><div className="sub">订单数</div><b>{list.length}</b></div>
            <div className="tile"><div className="sub">客单价</div><b>¥{avg}</b></div>
            <div className="tile"><div className="sub">毛利</div><b style={{ color: profit >= 0 ? 'var(--ok)' : 'var(--danger)' }}>¥{r1(profit)}</b></div>
            <div className="tile"><div className="sub">毛利率</div><b>{rate}%</b></div>
            <div className="tile"><div className="sub">入库支出</div><b>¥{r1(inSpend)}</b></div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>毛利 = 营业额 − 菜品成本（按菜单里填的成本价算，没填的菜不计）</div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <b>营业额趋势</b>
            <span className="sub" style={{ marginLeft: 'auto' }}>按{gran} · <span style={{ color: 'var(--brand)' }}>━</span> 营业额 <span style={{ color: 'var(--ok)' }}>┄</span> 毛利</span>
          </div>
          <Trend series={series} />
          <div className="sub">合计营业额 ¥{r1(revenue)} · 毛利 ¥{r1(profit)} · 毛利率 {rate}%</div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <b>菜品排行</b>
            <Chips />
          </div>
          <div className="sub">畅销 Top（按销量）</div>
          {top.length ? <RankBars rows={top.map(([name, s]) => ({ name, qty: s.qty }))} />
            : <div className="sub" style={{ padding: 6 }}>这段时间还没有清台的订单。</div>}
          {top.length > 0 && (
            <div className="sub" style={{ marginTop: 6 }}>
              {top.slice(0, 3).map(([n, s]) => `${n} 毛¥${r1(s.margin)}`).join('，')}
              {noMargin.length > 0 && <div style={{ color: 'var(--danger)' }}>不赚钱：{noMargin.map(([n]) => n).join('，')}</div>}
            </div>
          )}
          {top.length > 0 && idle.length > 0 && (
            <>
              <div className="sub" style={{ marginTop: 10 }}>卖不动（考虑下架或促销）</div>
              {idle.slice(0, 5).map((d) => (
                <div className="row" key={d.name}>
                  <div className="grow name" style={{ fontSize: 15, color: 'var(--sub)' }}>{d.name}</div>
                  <span className="sub">{d.qty ? `仅 ×${d.qty}` : '0 单'} · ¥{d.price}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <b>库存日报</b>
          <div className="sub" style={{ marginTop: 4 }}>
            今日入库 {r1(inQtyToday)}（支出 ¥{r1(inSpendToday)}）· 今日用量 {r1(useQtyToday)} · 当前结余 ¥{r1(value)}
            {low.length > 0 && <> · <b style={{ color: 'var(--danger)' }}>该补货：{low.map((m) => m.name).join('、')}</b></>}
          </div>
          {diffMoves.length > 0 && (
            <div className="sub" style={{ marginTop: 6 }}>
              今日盘点差异：{diffMoves.map((m) => `${m.matName} ${m.diff > 0 ? '+' : ''}${r1(m.diff)}${m.unit}`).join('，')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
