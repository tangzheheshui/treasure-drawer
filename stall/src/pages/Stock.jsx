import React, { useState } from 'react';
import { uid, addMat, removeMat, stockIn, stockUse, stockCount, lowMats, stockValue, todayMoves } from '../store.js';

// 库存：原料建档 → 入库 → 出库（直接填用量 / 盘点倒推）→ 价值、低库存、差异自动记录
export default function Stock({ db, update }) {
  const [dlg, setDlg] = useState(null); // {mode:'mat'|'in'|'use'|'count', mat?}
  const [f, setF] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const low = lowMats(db);
  const value = stockValue(db);
  const moves = todayMoves(db);

  const open = (mode, mat) => { setF({}); setDlg({ mode, mat }); };
  const num = () => Number(f.qty);

  const submit = () => {
    if (dlg.mode === 'mat') {
      if (!(f.name || '').trim()) return;
      update((d) => addMat(d, f));
    } else if (dlg.mode === 'in') {
      if (!(num() > 0)) return;
      update((d) => stockIn(d, dlg.mat.id, num(), Number(f.price) || 0));
    } else if (dlg.mode === 'use') {
      if (!(num() > 0)) return;
      update((d) => stockUse(d, dlg.mat.id, num()));
    } else if (dlg.mode === 'count') {
      if (num() < 0 || f.qty === '' || f.qty === undefined) return;
      update((d) => stockCount(d, dlg.mat.id, num()));
    }
    setDlg(null);
  };

  return (
    <>
      <div className="nav">库存
        <button className="act" onClick={() => open('mat')}>＋ 原料</button>
      </div>
      <div className="page">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>
              <div className="sub">库存价值（按最近进价估）</div>
              <b style={{ fontSize: 24 }}>¥{Math.round(value * 100) / 100}</b>
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
                <div className="grow" style={{ cursor: 'default' }}>
                  <div className="name">
                    {m.name} {isLow && <span className="pill unserved">低于安全线 {m.safe}{m.unit}</span>}
                  </div>
                  <div className="sub">{m.cat || '未分类'} · 剩 <b style={{ color: isLow ? 'var(--danger)' : 'var(--ink)' }}>{Math.round(m.stock * 100) / 100}{m.unit}</b> · 值 ¥{Math.round(m.stock * (m.lastPrice || 0) * 100) / 100}</div>
                </div>
                <button className="mini ok" onClick={() => open('in', m)}>入库</button>
                <button className="mini" onClick={() => open('use', m)}>用掉</button>
                <button className="mini" onClick={() => open('count', m)}>盘点</button>
                {editing() && <button className="sqbtn del" onClick={() => setConfirmDel(m)}>✕</button>}
              </div>
            );
          })}
          {!db.mats.length && <div className="sub" style={{ padding: 12 }}>还没有原料，点右上「＋ 原料」建档。</div>}
        </div>

        <div className="card">
          <b>今日流水</b>
          <div style={{ marginTop: 4 }}>
            {moves.map((m) => (
              <div className="row" key={m.id}>
                <div className="grow">
                  <div className="name" style={{ fontSize: 14 }}>{m.matName}</div>
                  <div className="sub">
                    {new Date(m.at).toTimeString().slice(0, 5)}{' '}
                    {m.type === 'in' && `入库 +${m.qty}${m.unit}${m.price ? ` @¥${m.price}` : ''}`}
                    {m.type === 'use' && `用量 −${m.qty}${m.unit}`}
                    {m.type === 'count' && `盘点剩 ${m.qty}${m.unit}${m.diff ? `（差异 ${m.diff > 0 ? '+' : ''}${Math.round(m.diff * 100) / 100}${m.unit}）` : ''}`}
                  </div>
                </div>
                <span className={`pill ${m.type === 'in' ? 'served' : m.type === 'use' ? 'unserved' : ''}`}>
                  {m.type === 'in' ? '+' : m.type === 'use' ? '−' : '='}{m.type === 'count' ? m.qty : m.qty}{m.unit}
                </span>
              </div>
            ))}
            {!moves.length && <div className="sub" style={{ padding: 8 }}>今天还没有出入库记录。</div>}
          </div>
        </div>
      </div>

      {/* 编辑态删原料的确认 */}
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
            ) : (
              <>
                <h3>{dlg.mat.name} · {dlg.mode === 'in' ? '入库' : dlg.mode === 'use' ? '今日用量' : '盘点'}</h3>
                <div className="sub">当前剩 {dlg.mat.stock}{dlg.mat.unit}</div>
                <div className="label">
                  {dlg.mode === 'in' ? `入库数量（${dlg.mat.unit}）` : dlg.mode === 'use' ? `用了多少（${dlg.mat.unit}）` : `实际还剩多少（${dlg.mat.unit}）`}
                </div>
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

// 长按不需要：删原料走行内 ✕（编辑意图明确时才显示）——当前版本直接常驻，避免藏功能
function editing() { return true; }
