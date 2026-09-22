import React, { useState } from 'react';
import { uid, hasSpecs } from '../store.js';

export default function MenuPage({ db, update, nav }) {
  const [editing, setEditing] = useState(false);  // 默认浏览态，点「编辑」才进管理
  const [edit, setEdit] = useState(null);         // { id?, catId, name, price, soldOut, specs }
  const [newCat, setNewCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [confirm, setConfirm] = useState(null);   // { text, ok: fn }

  const ask = (text, ok) => setConfirm({ text, ok });

  // 规格编辑：specs [{ name, opts:[{n, d}] }]；d 差价输入期是字符串，保存时归一
  const setSpecs = (fn) => setEdit((e) => { const specs = JSON.parse(JSON.stringify(e.specs || [])); fn(specs); return { ...e, specs }; });

  const save = () => {
    const name = (edit.name || '').trim();
    const price = Math.max(0, Math.round(Number(edit.price) * 100) / 100);
    const cost = edit.cost === '' || edit.cost === undefined || edit.cost === null ? 0 : Math.max(0, Number(edit.cost) || 0);
    const specs = (edit.specs || [])
      .map((g) => ({
        name: (g.name || '').trim(),
        opts: g.opts.map((o) => ({ n: (o.n || '').trim(), d: Math.max(0, Number(o.d) || 0) })).filter((o) => o.n),
      }))
      .filter((g) => g.name && g.opts.length);
    if (!name || Number.isNaN(price)) return;
    const unit = (edit.unit || '').trim() || '份';
    update((d) => {
      if (edit.id) {
        const it = d.dishes.find((x) => x.id === edit.id);
        Object.assign(it, { name, price, cost, soldOut: !!edit.soldOut, specs, unit });
      } else {
        d.dishes.push({ id: uid(), catId: edit.catId, name, price, cost, soldOut: false, specs, unit });
      }
    });
    setEdit(null);
  };

  return (
    <>
      <div className="nav">
        <button className="back" onClick={() => nav('#/tables')}>← 前台</button>
        菜品
        <button className="act" style={editing ? { background: '#2b7a4b' } : undefined}
                onClick={() => setEditing(!editing)}>{editing ? '✓ 完成' : '编辑'}</button>
      </div>
      <div className="page">
        {db.cats.map((c, ci) => {
          const dishes = db.dishes.filter((d) => d.catId === c.id);
          const CAT_COLORS = ['#c2571a', '#2b7a4b', '#8a5a9e', '#4e5969', '#b42318', '#b08a2a'];
          return (
            <div className="card" key={c.id} style={{ paddingTop: 4, paddingBottom: editing ? 12 : 4 }}>
              <div className="mhead">
                <b><span className="catdot" style={{ background: CAT_COLORS[ci % CAT_COLORS.length] }} />{c.name}</b>
                <span className="sub">{dishes.length} 道</span>
                <span className="line" />
                {editing && (
                  <>
                    <button className="mini ok" onClick={() => setEdit({ id: null, catId: c.id, name: '', price: '', specs: [] })}>＋ 加菜品</button>
                    <button
                      className="mini"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => ask(
                        dishes.length ? `删除分类「${c.name}」？下面 ${dishes.length} 道菜会一起删掉。` : `删除空分类「${c.name}」？`,
                        () => update((d) => {
                          d.cats = d.cats.filter((x) => x.id !== c.id);
                          d.dishes = d.dishes.filter((x) => x.catId !== c.id);
                        })
                      )}
                    >删分类</button>
                  </>
                )}
              </div>

              {dishes.map((d) => (
                <div className="mrow" key={d.id}
                     onClick={() => { if (editing) setEdit({ ...d, specs: (d.specs || []).map((g) => ({ ...g, opts: g.opts.map((o) => ({ ...o })) })) }); }}
                     style={{ cursor: editing ? 'pointer' : 'default', opacity: d.soldOut ? 0.45 : 1 }}>
                  <span className={`mname ${d.soldOut ? 'dead' : ''}`}>
                    {d.name}{hasSpecs(d) && <span className="sub" style={{ marginLeft: 6, fontSize: 12 }}>{d.specs.map((g) => g.name).join('/')}可选</span>}
                    {d.soldOut && <span className="pill" style={{ marginLeft: 8 }}>售罄</span>}
                  </span>
                  <span className="dots" />
                  <span className="price">¥{d.price}</span>
                  {editing && (
                    <>
                      <button
                        className={'mini ' + (d.soldOut ? '' : 'ok')}
                        onClick={(e) => { e.stopPropagation(); update((x) => { const it = x.dishes.find((y) => y.id === d.id); it.soldOut = !it.soldOut; }); }}
                      >{d.soldOut ? '已售罄' : '在售'}</button>
                      <button
                        className="sqbtn del"
                        onClick={(e) => { e.stopPropagation(); ask(`删除「${d.name}」（¥${d.price}）？已下的单不受影响。`, () => update((x) => { x.dishes = x.dishes.filter((y) => y.id !== d.id); })); }}
                      >✕</button>
                    </>
                  )}
                </div>
              ))}
              {!dishes.length && (
                <div className="sub" style={{ padding: '10px 2px' }}>
                  {editing ? '还没有菜，点上面「＋ 加菜品」。' : '这个分类还没有菜。'}
                </div>
              )}
            </div>
          );
        })}
        <div className="sub" style={{ textAlign: 'center' }}>
          {editing ? '点菜名改价 / 标售罄，✕ 删除；改完点「✓ 完成」' : '点右上「编辑」改菜单'}
        </div>
      </div>

      {confirm && (
        <div className="mask" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>确认</h3>
            <div className="sub">{confirm.text}</div>
            <div className="mfoot">
              <button className="btn" onClick={() => setConfirm(null)}>取消</button>
              <button className="btn danger" onClick={() => { confirm.ok(); setConfirm(null); }}>删除</button>
            </div>
          </div>
        </div>
      )}

      {newCat && (
        <div className="mask" onClick={() => setNewCat(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>新分类</h3>
            <input className="f" placeholder="如：串类 / 酒水 / 主食" value={catName} onChange={(e) => setCatName(e.target.value)} />
            <div className="mfoot">
              <button className="btn" onClick={() => setNewCat(false)}>取消</button>
              <button className="btn primary" onClick={() => {
                const name = catName.trim();
                if (name) update((d) => d.cats.push({ id: uid(), name }));
                setNewCat(false);
              }}>添加</button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div className="mask" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>{edit.id ? '编辑菜品' : '加菜品'}</h3>
            <div className="label">名称</div>
            <input className="f" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="label">价格（元）</div>
            <input className="f" type="number" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            <div className="label">成本价（元，选填，用于毛利统计）</div>
            <input className="f" type="number" inputMode="decimal" value={edit.cost ?? ''} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} placeholder="不填则不计成本" />
            <div className="label">单位（串/瓶/份/个…）</div>
            <input className="f" value={edit.unit ?? ''} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="默认「份」" />

            <div className="label">规格（选填，最多两组，如辣度/份量；选项可带差价）</div>
            {(edit.specs || []).map((g, gi) => (
              <div className="specbox" key={gi}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="f" style={{ width: 120, padding: '6px 10px' }} value={g.name} placeholder="组名：如 辣度"
                         onChange={(e) => setSpecs((s) => { s[gi].name = e.target.value; })} />
                  <button className="sqbtn del" style={{ width: 30, height: 30, marginLeft: 'auto' }}
                          onClick={() => setSpecs((s) => s.filter((_, i) => i !== gi))}>✕</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  {g.opts.map((o, oi) => (
                    <span key={oi} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--line)', borderRadius: 99, padding: '3px 4px 3px 10px' }}>
                      <input style={{ width: 58, border: 0, fontSize: 13, outline: 'none' }} value={o.n} placeholder="选项"
                             onChange={(e) => setSpecs((s) => { s[gi].opts[oi].n = e.target.value; })} />
                      <input style={{ width: 40, border: 0, fontSize: 12, color: 'var(--sub)', outline: 'none' }} type="number" inputMode="decimal" title="差价（元）" value={o.d}
                             onChange={(e) => setSpecs((s) => { s[gi].opts[oi].d = e.target.value; })} />
                      <button className="mini" style={{ padding: '2px 7px' }}
                              onClick={() => setSpecs((s) => { s[gi].opts.splice(oi, 1); })}>✕</button>
                    </span>
                  ))}
                  <button className="mini" onClick={() => setSpecs((s) => { s[gi].opts.push({ n: '', d: '' }); })}>＋选项</button>
                </div>
              </div>
            ))}
            {(edit.specs || []).length < 2 && (
              <button className="mini" style={{ marginTop: 8 }}
                      onClick={() => setSpecs((s) => { s.push({ name: '', opts: [{ n: '', d: '' }] }); })}>＋ 加规格组</button>
            )}

            <div className="sub" style={{ marginTop: 8 }}>售罄/上架用列表里的一键开关更快，不用进这里。</div>
            <div className="mfoot">
              {edit.id && <button className="btn danger" onClick={() => ask(`删除「${edit.name}」？已下的单不受影响。`, () => { update((d) => { d.dishes = d.dishes.filter((x) => x.id !== edit.id); }); setEdit(null); })}>删除</button>}
              <button className="btn" onClick={() => setEdit(null)}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
