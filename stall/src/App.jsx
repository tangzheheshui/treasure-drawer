import React, { useEffect, useState } from 'react';
import { loadDB, getDB, mutate, subscribe } from './store.js';
import { syncVoice } from './voice.js';
import { bootstrapRealtime } from './sync.js';
import Tables from './pages/Tables.jsx';
import TakeOrder from './pages/TakeOrder.jsx';
import Detail from './pages/Detail.jsx';
import MenuPage from './pages/Menu.jsx';
import Settings from './pages/Settings.jsx';
import History from './pages/History.jsx';
import Qr from './pages/Qr.jsx';

function parseRoute() {
  const h = (location.hash || '#/tables').replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(query || ''));
  return { seg, q };
}

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
  syncVoice(db.shop);
  const update = (fn) => mutate(fn);
  const nav = (h) => { location.hash = h; };

  const [page, param] = route.seg;
  let body = null;
  let tab = page || 'tables';
  if (page === 'order' && param) body = <TakeOrder db={db} update={update} tableNo={+param} add={!!route.q.add} nav={nav} />;
  else if (page === 'table' && param) body = <Detail db={db} tableNo={+param} update={update} nav={nav} />;
  else if (page === 'menu') body = <MenuPage db={db} update={update} />;
  else if (page === 'history') body = <History db={db} />;
  else if (page === 'settings') body = <Settings db={db} update={update} nav={nav} />;
  else if (page === 'qr') body = <Qr db={db} nav={nav} />;
  else { tab = 'tables'; body = <Tables db={db} update={update} nav={nav} />; }

  const isFlow = page === 'order' || page === 'table' || page === 'qr';

  return (
    <div className="app">
      {body}
      {!isFlow && (
        <div className="tabbar">
          {[['tables', '🧾', '桌台'], ['menu', '🍲', '菜品'], ['history', '📊', '统计'], ['settings', '⚙️', '设置']].map(([k, ico, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => nav(`#/${k}`)}>
              <span className="ico">{ico}</span>{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
