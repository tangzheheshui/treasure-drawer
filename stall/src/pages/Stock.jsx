import React, { useState } from 'react';
import { addMat, removeMat, stockIn, stockUse, stockCount, lowMats, stockValue, todayMoves } from '../store.js';

const r1 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;

// 库存：原料建档 → 入库 → 用量（可补记到最近某天）→ 盘点（整体，倒推差异）→ 价值/低库存/按天流水
export default function Stock({ db, update }) {
  const [dlg, setDlg] = useState(null); // {mode:'mat'|'in'|'use'|'count', mat?}  use 可不带 mat（带原料下拉）
  const [f, setF] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const low = lowMats(db);
  const value = stockValue(db);
  const tm = todayMoves(db);

  const open = (mode, mat, presetDay) => { setF({ day: presetDay ?? 0 }); setDlg({ mode, mat }); };
  const num = () => Number(f.qty);
  const matOf = () => dlg.mat || db.mats.find((m) => m.id === f.matId);
  const unitOf = () => (matOf() ? matOf().unit : '');

  const submit = () => {
    if (dlg.mode === 'mat') {
      if (!(f.name || '').trim()) return;
      update((d) => addMat(d, f));
    } else if (dlg.mode === 'in') {
      if (!(num() > 0)) return;
      update((d) => stockIn(d, dlg.mat.id, num(), Number(f.price) || 0));
    } else if (dlg.mode === 'use') {
      const m = matOf();
      if (!m || !(num() > 0)) return;
      update((d) => stockUse(d, m.id, num(), f.day || 0));
    } else if (dlg.mode === 'count') {
      if (f.qty === '' || f.qty === undefined || num() < 0) return;
      update((d) => stockCount(d, dlg.mat.id, num()));
    }
    setDlg(null);
  };

  // ── 按天流水：每天可记多次，按日聚合，点开看每项小计 ──
  const dayKeyOf = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const groups = {};
  db.moves.forEach((m) => { const k = dayKeyOf(m.at); (groups[k] = groups[k] || []).push(m); });
  const days = Object.entries(groups).sort((a, b) => b[0] - a[0]).slice(0, 7);
  const today0 = dayKeyOf(Date.now());
  const dayLabel = (k) => (k === today0 ? '今天' : k === today0 - DAY ? '昨天' : `${new Date(Number(k)).getMonth() + 1}月${new Date(Number(k)).getDate()}日`);
  const dayChips = (day, setDay) => (
    <div className="catbar" style={{ paddingBottom: 0 }}>
      {[0, -1, -2, -3, -4, -5, -6].map((o) => (
        <button key={o} className={(day || 0) === o ? 'on' : ''} onClick={() => setDay(o)}>
          {o === 0 ? '今天' : o === -1 ? '昨天' : o === -2 ? '前天' : `${-o}天前`}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="nav">库存<button className="act" onClick={() => open('mat')}>＋ 原料</button></div>
      <div className="page">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
              <div className="sub">库存价值（按最近进价估）</div>
              <b style={{ fontSize: 24 }}>¥{r1(value)}</b>
            </div>
            {low.length > 0 && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="sub">低于安全线</div>
                <b style={{ color: 'var(--danger)' }}>{low.map((m) => m.name).join('、')}</b>
              </div>
            )}
          </div>
          {low.length > 0 && <div className="sub" style={{ marginTop: 6, color: 'var(--danger)' }}>🔔 有原料低于安全线，记得补货入库</div>}
        </div>

        <div className="card">
          {db.mats.map((m) => {
            const isLow = m.stock < m.safe;
            return (
              <div className="row" key={m.id}>
                <div className="grow">
                  <div className="name">
                    {m.name} {isLow && <span className="pill unserved">低于安全线 {m.safe}{m.unit}</span>}
                  </div>
                  <div className="sub">{m.cat || '未分类'} · 剩 <b style={{ color: isLow ? 'var(--danger)' : 'var(--ink)' }}>{r1(m.stock)}{m.unit}</b> · 值 ¥{r1(m.stock * (m.lastPrice || 0))}</div>
                </div>
                <button className="mini ok" onClick={() => open('in', m)}>入库</button>
                <button className="mini" onClick={() => open('use', m)}>用掉</button>
                <button className="mini" onClick={() => open('count', m)}>盘点</button>
                <button className="sqbtn del" onClick={() => setConfirmDel(m)}>✕</button>
              </div>
            );
          })}
          {!db.mats.length && <div className="sub" style={{ padding: 12 }}>还没有原料，点右上「＋ 原料」建档。</div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <b>按天流水</b>
            <span className="sub" style={{ marginLeft: 'auto' }}>最近 7 天，点一天展开</span>
          </div>
          {days.map(([k, list]) => {
            const inAmt = list.filter((m) => m.type === 'in').reduce((s, m) => s + m.qty * (m.price || 0), 0);
            const useQty = list.filter((m) => m.type === 'use').reduce((s, m) => s + m.qty, 0);
            const diffCnt = list.filter((m) => m.type === 'count' && m.diff).length;
            const open_ = openDay === null ? Number(k) === today0 : openDay === Number(k);
            // 展开后按原料小计：这一天的每一项用了多少一目了然
            const byMat = {};
            list.forEach((m) => {
              const g = byMat[m.matName] || (byMat[m.matName] = { unit: m.unit, in: 0, use: 0, diff: 0, hasDiff: false, entries: [] });
              g.entries.push(m);
              if (m.type === 'in') g.in += m.qty;
              if (m.type === 'use') g.use += m.qty;
              if (m.type === 'count' && m.diff) { g.diff += m.diff; g.hasDiff = true; }
            });
            return (
              <div key={k} style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                     onClick={() => setOpenDay(open_ ? -1 : Number(k))}>
                  <b style={{ fontSize: 15 }}>{dayLabel(Number(k))}</b>
                  <span className="sub">入库 ¥{r1(inAmt)} · 用量 {r1(useQty)}{diffCnt ? ` · 差异 ${diffCnt} 项` : ''}</span>
                  <span className="sub" style={{ marginLeft: 'auto' }}>{open_ ? '▾' : '▸'}</span>
                </div>
                {open_ && (
                  <>
                    <button className="mini ok" style={{ margin: '6px 0' }}
                            onClick={(e) => { e.stopPropagation(); open('use', null, Number(k)); }}>＋ 记这天的用量</button>
                    {Object.entries(byMat).map(([name, g]) => (
                      <div key={name} style={{ borderTop: '1px dashed var(--line)', paddingTop: 6, marginTop: 6 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <b className="grow" style={{ fontSize: 14 }}>{name}</b>
                          <span className="sub">
                            {g.in ? `入库 ${r1(g.in)}${g.unit} ` : ''}
                            {g.use ? `用掉 ${r1(g.use)}${g.unit}` : ''}
                            {g.hasDiff ? ` 盘差 ${r1(g.diff)}${g.unit}` : ''}
                          </span>
                        </div>
                        {g.entries.map((m) => (
                          <div className="sub" key={m.id} style={{ padding: '2px 0 2px 10px' }}>
                            {new Date(m.at).toTimeString().slice(0, 5)}{' '}
                            {m.type === 'in' && `入库 +${r1(m.qty)}${m.unit}${m.price ? ` @¥${m.price}` : ''}`}
                            {m.type === 'use' && `用量 −${r1(m.qty)}${m.unit}`}
                            {m.type === 'count' && `盘点剩 ${r1(m.qty)}${m.unit}${m.diff ? `（差异 ${m.diff > 0 ? '+' : ''}${r1(m.diff)}）` : ''}`}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
          {!days.length && <div className="sub" style={{ padding: 8 }}>还没有出入库记录。</div>}
        </div>
      </div>

      {confirmDel && (
        <div className="mask" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>删除原料「{confirmDel.name}」？</h3>
            <div className="sub">只删档案，历史流水保留。</div>
            <div className="mfoot">
              <button className="btn" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="btn danger" onClick={() => { update((d) => removeMat(d, confirmDel.id)); setConfirmDel(null); }}>删除</button>
            </div>
          </div>
        </div>
      )}

      {dlg && (
        <div className="mask" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {dlg.mode === 'mat' ? (
              <>
                <h3>新原料</h3>
                <div className="label">名称</div>
                <input className="f" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="如：羊肉片" />
                <div className="label">单位（斤 / 瓶 / 把…）</div>
                <input className="f" value={f.unit || ''} onChange={(e) => setF({ ...f, unit: e.target.value })} />
                <div className="label">分类</div>
                <input className="f" value={f.cat || ''} onChange={(e) => setF({ ...f, cat: e.target.value })} placeholder="肉类 / 酒水 / 耗材" />
                <div className="label">安全线（低于就提醒）</div>
                <input className="f" type="number" inputMode="decimal" value={f.safe ?? ''} onChange={(e) => setF({ ...f, safe: e.target.value })} />
                <div className="label">初始库存（可留空）</div>
                <input className="f" type="number" inputMode="decimal" value={f.stock ?? ''} onChange={(e) => setF({ ...f, stock: e.target.value })} />
                <div className="label">最近进价（元/单位，可留空）</div>
                <input className="f" type="number" inputMode="decimal" value={f.price ?? ''} onChange={(e) => setF({ ...f, price: e.target.value })} />
              </>
            ) : dlg.mode === 'use' ? (
              <>
                <h3>{dlg.mat ? `${dlg.mat.name} · 记用量` : '记用量'}</h3>
                {dlg.mat
                  ? <div className="sub">当前剩 {r1(dlg.mat.stock)}{dlg.mat.unit}</div>
                  : (
                    <>
                      <div className="label">原料</div>
                      <select className="f" value={f.matId || ''} onChange={(e) => setF({ ...f, matId: e.target.value })}>
                        <option value="" disabled>选原料</option>
                        {db.mats.map((m) => <option key={m.id} value={m.id}>{m.name}（剩 {r1(m.stock)}{m.unit}）</option>)}
                      </select>
                    </>
                  )}
                <div className="label">用了多少（{unitOf()}）</div>
                <input className="f" type="number" inputMode="decimal" autoFocus value={f.qty ?? ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                <div className="label">记在哪一天（一天可以记多次）</div>
                {dayChips(f.day, (day) => setF({ ...f, day }))}
              </>
            ) : (
              <>
                <h3>{dlg.mat.name} · {dlg.mode === 'in' ? '入库' : '盘点'}</h3>
                <div className="sub">当前剩 {r1(dlg.mat.stock)}{dlg.mat.unit}</div>
                <div className="label">{dlg.mode === 'in' ? `入库数量（${dlg.mat.unit}）` : `实际还剩多少（${dlg.mat.unit}）`}</div>
                <input className="f" type="number" inputMode="decimal" autoFocus value={f.qty ?? ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                {dlg.mode === 'in' && (
                  <>
                    <div className="label">单价（元/{dlg.mat.unit}）</div>
                    <input className="f" type="number" inputMode="decimal" value={f.price ?? ''} onChange={(e) => setF({ ...f, price: e.target.value })} />
                  </>
                )}
                {dlg.mode === 'count' && <div className="sub" style={{ marginTop: 8 }}>填实际剩余即可，用量和差异系统自动倒推记录。</div>}
              </>
            )}
            <div className="mfoot">
              <button className="btn" onClick={() => setDlg(null)}>取消</button>
              <button className="btn primary" onClick={submit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
