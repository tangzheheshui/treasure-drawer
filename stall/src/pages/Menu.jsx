import React, { useState } from 'react';
import { uid } from '../store.js';

export default function MenuPage({ db, update }) {
  const [edit, setEdit] = useState(null);   // { id?, catId, name, price, soldOut }
  const [newCat, setNewCat] = useState(false);
  const [catName, setCatName] = useState('');

  const save = () => {
    const name = (edit.name || '').trim();
    const price = Math.max(0, Math.round(Number(edit.price) * 100) / 100);
    if (!name || Number.isNaN(price)) return;
    update((d) => {
      if (edit.id) {
        const it = d.dishes.find((x) => x.id === edit.id);
        Object.assign(it, { name, price, soldOut: !!edit.soldOut });
      } else {
        d.dishes.push({ id: uid(), catId: edit.catId, name, price, soldOut: false });
      }
    });
    setEdit(null);
  };

  return (
    <>
      <div className="nav">菜品管理<button className="act" onClick={() => { setCatName(''); setNewCat(true); }}>＋ 分类</button></div>
      <div className="page">
        {db.cats.map((c) => (
          <div className="card" key={c.id}>
            <b>{c.name}</b>
            <div style={{ marginTop: 4 }}>
              {db.dishes.filter((d) => d.catId === c.id).map((d) => (
                <div className="row" key={d.id}>
                  <div className="grow">
                    <div className={`name ${d.soldOut ? 'dead' : ''}`}>{d.name}{d.soldOut && <span className="pill" style={{ marginLeft: 8 }}>售罄</span>}</div>
                  </div>
                  <span className="price">¥{d.price}</span>
                  <button className="mini" onClick={() => setEdit({ ...d })}>编辑</button>
                </div>
              ))}
              {!db.dishes.some((d) => d.catId === c.id) && <div className="sub" style={{ padding: '8px 0' }}>还没有菜。</div>}
            </div>
            <button className="mini ok" style={{ marginTop: 8 }} onClick={() => setEdit({ id: null, catId: c.id, name: '', price: '' })}>＋ 加菜品</button>
          </div>
        ))}
        <div className="sub" style={{ textAlign: 'center' }}>点菜品可改价、标记售罄或删除</div>
      </div>

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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{edit.id ? '编辑菜品' : '加菜品'}</h3>
            <div className="label">名称</div>
            <input className="f" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="label">价格（元）</div>
            <input className="f" type="number" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
            <div className="label">售罄</div>
            <button className="btn block" onClick={() => setEdit({ ...edit, soldOut: !edit.soldOut })}>
              {edit.soldOut ? '已售罄（点这里恢复）' : '在售（点这里标记售罄）'}
            </button>
            <div className="mfoot">
              {edit.id && <button className="btn danger" onClick={() => { update((d) => { d.dishes = d.dishes.filter((x) => x.id !== edit.id); }); setEdit(null); }}>删除</button>}
              <button className="btn" onClick={() => setEdit(null)}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
