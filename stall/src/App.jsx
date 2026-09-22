import React, { useEffect, useState } from 'react';
import { loadDB, getDB, mutate, subscribe } from './store.js';
import { syncVoice } from './voice.js';
import { bootstrapRealtime } from './sync.js';
import Tables from './pages/Tables.jsx';
import TakeOrder from './pages/TakeOrder.jsx';
import Detail from './pages/Detail.jsx';
import MenuPage from './pages/Menu.jsx';
import Stock from './pages/Stock.jsx';
import Settings from './pages/Settings.jsx';
import History from './pages/History.jsx';
import Qr from './pages/Qr.jsx';
import Receipt from './pages/Receipt.jsx';

function parseRoute() {
  const h = (location.hash || '#/tables').replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  return { seg, q };
}

// 两层模式（由路由推导，无需状态）：
// 经营层 = 桌台 + 点单 + 订单（日常营业长时间停留，无任何管理入口干扰）
// 管理层 = 菜品 / 库存 / 统计 / 设置（整理时才进，右上「回到经营」一键返回）
const ADMIN = ['menu', 'stock', 'history', 'settings', 'qr'];

export default function App() {
  const [db, setDb] = useState(null);
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    loadDB().then((d) => { setDb({ ...getDB() }); bootstrapRealtime(d, () => setDb({ ...getDB() })); });
    const onHash = () => setRoute(parseRoute());
    addEventListener('hashchange', onHash);
    const un = subscribe(() => setDb({ ...getDB() }));
    return () => { removeEventListener('hashchange', onHash); un(); };
  }, []);

  if (!db) return null;
  if (typeof window !== 'undefined') window.__stall = { db, route }; // 调试/自检探针
  syncVoice(db.shop);
  const update = (fn) => mutate(fn);
  const nav = (h) => { location.hash = h; };

  const [page, param] = route.seg;
  const admin = ADMIN.includes(page);

  let body = null;
  if (page === 'order' && param) body = param === 'walk'
    ? <TakeOrder db={db} update={update} walk nav={nav} />
    : <TakeOrder db={db} update={update} tableNo={+param} add={!!route.q.add} nav={nav} />;
  else if (page === 'o' && param) body = <Detail db={db} orderId={param} update={update} nav={nav} />;
  else if (page === 'table' && param) body = <Detail db={db} tableNo={+param} update={update} nav={nav} />;
  else if (page === 'receipt' && param) body = <Receipt db={db} orderId={param} nav={nav} />;
  else if (page === 'qr') body = <Qr db={db} nav={nav} />;
  else if (page === 'menu') body = <MenuPage db={db} update={update} nav={nav} />;
  else if (page === 'stock') body = <Stock db={db} update={update} nav={nav} />;
  else if (page === 'history') body = <History db={db} nav={nav} />;
  else if (page === 'settings') body = <Settings db={db} update={update} nav={nav} />;
  else body = <Tables db={db} update={update} nav={nav} onAdmin={() => nav('#/menu')} />;

  return (
    <div className="app">
      {body}
      {admin && (
        <div className="adminbar">
          {[['menu', '菜品'], ['stock', '库存'], ['history', '统计'], ['settings', '设置']].map(([k, label]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => nav(`#/${k}`)}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
