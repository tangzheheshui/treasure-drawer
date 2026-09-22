import React, { useState } from 'react';
import { addMat, removeMat, stockIn, stockUse, stockCount, lowMats, stockValue } from '../store.js';

const r1 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;

// 库存：页面本体只做展示（现状/明细/按天图表）；所有变更收进右上「＋ 记一笔」一个入口
export default function Stock({ db, update, nav }) {
  const [entry, setEntry] = useState(false);
  const [tab, setTab] = useState('in'); // in | out | count | mat
  const [f, setF] = useState({ day: 0 });
  const [confirmDel, setConfirmDel] = useState(null);
  const [openDay, setOpenDay] = useState(null);
  const [newMat, setNewMat] = useState(false); // 原料列表里的新建表单开关
  const low = lowMats(db);
  const value = stockValue(db);
  const matOf = () => db.mats.find((m) => m.id === f.matId);

  const openEntry = (t) => { setTab(t); setF({ day: 0 }); setEntry(true); };
  const save = () => {
    if (tab === 'in') {
      if (!f.matId || !(Number(f.qty) > 0)) return;
      update((d) => stockIn(d, f.matId, Number(f.qty), Number(f.price) || 0));
    } else if (tab === 'out') {
      if (!f.matId || !(Number(f.qty) > 0)) return;
      update((d) => stockUse(d, f.matId, Number(f.qty), f.day || 0));
    } else if (tab === 'count') {
      if (!f.matId || f.qty === '' || f.qty === undefined || Number(f.qty) < 0) return;
      update((d) => stockCount(d, f.matId, Number(f.qty)));
    }
    setEntry(false);
  };
  const saveMat = () => {
    if (!(f.name || '').trim()) return;
    let id;
    update((d) => { id = addMat(d, { name: f.name, unit: f.unit, cat: f.cat, safe: f.safe, stock: f.stock, price: f.price }).id; });
    setF({ day: 0, matId: id });
    setNewMat(false);
  };

  // ── 展示数据 ──
  const dayKeyOf = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const groups = {};
  db.moves.forEach((m) => { const k = dayKeyOf(m.at); (groups[k] = groups[k] || []).push(m); });
  const days = Object.entries(groups).sort((a, b) => b[0] - a[0]).slice(0, 7);
  const today0 = dayKeyOf(Date.now());
  const dayLabel = (k) => (k === today0 ? '今天' : k === today0 - DAY ? '昨天' : `${new Date(Number(k)).getMonth() + 1}/${new Date(Number(k)).getDate()}`);
  const dayUse = days.map(([k, list]) => ({ k, label: dayLabel(Number(k)), use: r1(list.filter((m) => m.type === 'use').reduce((s, m) => s + m.qty, 0)) }));
  const maxUse = Math.max(...dayUse.map((d) => d.use), 1);

  const MatList = () => (
    <>
      <div className="label">选原料（点一下选中）</div>
      <div className="matlist">
        {db.mats.map((m) => (
          <div key={m.id} className={`matitem ${f.matId === m.id ? 'on' : ''}`} onClick={() => setF({ ...f, matId: m.id })}>
            <div className="grow">
              <div className="name" style={{ fontSize: 15 }}>{m.name}</div>
              <div className="sub">剩 {r1(m.stock)}{m.unit}{m.lastPrice ? ` · 进价 ¥${m.lastPrice}` : ''}</div>
            </div>
            {f.matId === m.id && <b style={{ color: 'var(--ok)' }}>✓</b>}
            <button className="sqbtn del" onClick={(e) => { e.stopPropagation(); setConfirmDel(m); }}>✕</button>
          </div>
        ))}
        {!db.mats.length && <div className="sub" style={{ padding: 12 }}>还没有原料，点下面「＋ 新建」建档。</div>}
        <div className="matadd" onClick={() => setNewMat(!newMat)}>{newMat ? '收起' : '＋ 新建原料'}</div>
      </div>
      {newMat && (
        <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
          <input className="f" placeholder="名称，如：羊肉片" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="f" placeholder="单位（斤/瓶…）" value={f.unit || ''} onChange={(e) => setF({ ...f, unit: e.target.value })} />
            <input className="f" placeholder="分类" value={f.cat || ''} onChange={(e) => setF({ ...f, cat: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="f" type="number" placeholder="安全线" value={f.safe ?? ''} onChange={(e) => setF({ ...f, safe: e.target.value })} />
            <input className="f" type="number" placeholder="初始库存" value={f.stock ?? ''} onChange={(e) => setF({ ...f, stock: e.target.value })} />
            <input className="f" type="number" placeholder="进价" value={f.price ?? ''} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </div>
          <button className="btn ok block" style={{ marginTop: 10 }} disabled={!(f.name || '').trim()} onClick={saveMat}>建档</button>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="nav"><button className="back" onClick={() => nav('#/tables')}>← 前台</button>库存<button className="act" onClick={() => openEntry('in')}>＋ 记一笔</button></div>
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
          {low.length > 0 && <div className="sub" style={{ marginTop: 6, color: 'var(--danger)' }}>🔔 有原料低于安全线，点右上「＋ 记一笔」入库</div>}
        </div>

        <div className="card">
          <b>库存明细</b>
          <div style={{ marginTop: 4 }}>
            {db.mats.map((m) => {
              const isLow = m.stock < m.safe;
              return (
                <div className="row" key={m.id}>
                  <div className="grow">
                    <div className="name">{m.name} {isLow && <span className="pill unserved">补货</span>}</div>
                    <div className="sub">{m.cat || '未分类'} · 安全线 {m.safe}{m.unit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <b style={{ color: isLow ? 'var(--danger)' : 'var(--ink)' }}>{r1(m.stock)}{m.unit}</b>
                    <div className="sub">值 ¥{r1(m.stock * (m.lastPrice || 0))}</div>
                  </div>
                </div>
              );
            })}
            {!db.mats.length && <div className="sub" style={{ padding: 12 }}>还没有原料，点右上「＋ 记一笔」新建。</div>}
          </div>
        </div>

        <div className="card">
          <b>最近 7 天用量</b>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90, marginTop: 10 }}>
            {dayUse.map((d) => (
              <div key={d.k} style={{ flex: 1, textAlign: 'center' }}>
                <div className="sub" style={{ fontSize: 10 }}>{d.use || ''}</div>
                <div style={{ height: Math.max(4, (d.use / maxUse) * 56), background: d.use ? 'var(--brand)' : '#e8eaee', borderRadius: 6, margin: '4px 2px' }} />
                <div className="sub" style={{ fontSize: 11 }}>{d.label}</div>
              </div>
            ))}
            {!dayUse.length && <div className="sub" style={{ padding: 8 }}>还没有出入库记录。</div>}
          </div>
        </div>

        <div className="card">
          <b>按天流水</b>
          <div className="sub" style={{ margin: '4px 0' }}>最近 7 天，点一天展开明细</div>
          {days.map(([k, list]) => {
            const inAmt = list.filter((m) => m.type === 'in').reduce((s, m) => s + m.qty * (m.price || 0), 0);
            const useQty = list.filter((m) => m.type === 'use').reduce((s, m) => s + m.qty, 0);
            const diffCnt = list.filter((m) => m.type === 'count' && m.diff).length;
            const open_ = openDay === null ? Number(k) === today0 : openDay === Number(k);
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
                {open_ && Object.entries(byMat).map(([name, g]) => (
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
              </div>
            );
          })}
          {!days.length && <div className="sub" style={{ padding: 8 }}>还没有出入库记录。</div>}
        </div>
      </div>

      {/* ── 唯一变更入口：记录弹层 ── */}
      {entry && (
        <div className="mask" onClick={() => setEntry(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['in', '入库'], ['out', '出库'], ['count', '盘点']].map(([k, label]) => (
                <button key={k} className={`mini ${tab === k ? 'ok' : ''}`} style={{ flex: 1, padding: '9px 0' }} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>

            {tab === 'in' && (
              <>
                <MatList />
                <div className="label">入库数量</div>
                <input className="f" type="number" inputMode="decimal" value={f.qty ?? ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                <div className="label">单价（元，选填）</div>
                <input className="f" type="number" inputMode="decimal" value={f.price ?? ''} onChange={(e) => setF({ ...f, price: e.target.value })} />
              </>
            )}
            {tab === 'out' && (
              <>
                <MatList />
                <div className="label">用了多少</div>
                <input className="f" type="number" inputMode="decimal" value={f.qty ?? ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                <div className="label">记在哪一天（一天可记多次）</div>
                <div className="catbar" style={{ paddingBottom: 0 }}>
                  {[0, -1, -2, -3, -4, -5, -6].map((o) => (
                    <button key={o} className={(f.day || 0) === o ? 'on' : ''} onClick={() => setF({ ...f, day: o })}>
                      {o === 0 ? '今天' : o === -1 ? '昨天' : o === -2 ? '前天' : `${-o}天前`}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === 'count' && (
              <>
                <MatList />
                <div className="label">实际还剩多少</div>
                <input className="f" type="number" inputMode="decimal" value={f.qty ?? ''} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                <div className="sub" style={{ marginTop: 8 }}>填实际剩余即可，用量和差异系统自动倒推记录。</div>
              </>
            )}
            <div className="mfoot">
              <button className="btn" onClick={() => setEntry(false)}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
