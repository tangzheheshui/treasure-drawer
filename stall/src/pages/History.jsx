import React from 'react';

export default function History({ db }) {
  const closed = db.orders.filter((o) => o.status === 'closed').sort((a, b) => b.closedAt - a.closedAt);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = closed.filter((o) => o.closedAt >= dayStart.getTime());
  const revenue = today.reduce((s, o) => s + o.items.reduce((x, i) => x + i.price * i.qty, 0), 0);
  const rank = {};
  today.forEach((o) => o.items.forEach((i) => { rank[i.name] = (rank[i.name] || 0) + i.qty; }));
  const top = Object.entries(rank).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const byDay = {};
  closed.forEach((o) => {
    const d = new Date(o.closedAt);
    const key = `${d.getMonth() + 1}月${d.getDate()}日`;
    (byDay[key] = byDay[key] || []).push(o);
  });

  return (
    <>
      <div className="nav">统计与历史</div>
      <div className="page">
        <div className="card">
          <b>今日</b>
          <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
            <div><div className="sub">订单数</div><b style={{ fontSize: 24 }}>{today.length}</b></div>
            <div><div className="sub">营收（仅记录）</div><b style={{ fontSize: 24 }}>¥{revenue}</b></div>
          </div>
          {top.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="sub">销量排行</div>
              {top.map(([name, qty]) => (
                <div className="row" key={name}><div className="grow name" style={{ fontSize: 15 }}>{name}</div><b>×{qty}</b></div>
              ))}
            </div>
          )}
        </div>

        {Object.keys(byDay).length === 0 && (
          <div className="card"><div className="sub">还没有已清台的订单。清台后的订单会按天归档在这里。</div></div>
        )}
        {Object.entries(byDay).map(([day, list]) => (
          <div className="card" key={day}>
            <b>{day}</b>
            {list.map((o) => (
              <div key={o.id} style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: 'flex' }}>
                  <b className="grow">{o.tableNo}号桌</b>
                  <span className="sub">{new Date(o.closedAt).toTimeString().slice(0, 5)}</span>
                  <b style={{ marginLeft: 12 }}>¥{o.items.reduce((s, i) => s + i.price * i.qty, 0)}</b>
                </div>
                <div className="sub">{o.items.map((i) => `${i.name}×${i.qty}`).join('，')}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
