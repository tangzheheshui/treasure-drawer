import React, { useState } from 'react';
import { seed } from '../store.js';
import { say } from '../voice.js';
import { login, register, ensureShop, publishMenu, subscribeRealtime, attachAutopublish, isOnline } from '../sync.js';

const DEFAULT_BASE = 'https://auth.tangzheheshui.cn';

export default function Settings({ db, update, nav }) {
  const [name, setName] = useState(db.shop.name);
  const [askReset, setAskReset] = useState(false);
  const [email, setEmail] = useState(db.shop.pbEmail || '');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const online = isOnline(db);

  const afterLogin = async () => {
    const rec = await ensureShop(db);
    await publishMenu(db);
    subscribeRealtime(db, () => {});
    attachAutopublish();
    update((d) => { d.shop.pbEmail = email.trim(); d.shop.pbId = rec.id; });
    setMsg('已联机，顾客下单会实时播报');
  };

  const doLogin = async (isReg) => {
    setBusy(true); setMsg('');
    try {
      update((d) => { d.shop.pbBase = (db.shop.pbBase || DEFAULT_BASE).trim(); });
      if (isReg) await register(db.shop.pbBase || DEFAULT_BASE, email.trim(), pass);
      else await login(db.shop.pbBase || DEFAULT_BASE, email.trim(), pass);
      await afterLogin();
    } catch (e) {
      setMsg(`失败：${String(e.message || e).slice(0, 60)}`);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="nav">设置</div>
      <div className="page">
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>店铺名称</div>
          <input className="f" value={name} onChange={(e) => setName(e.target.value)}
                 onBlur={() => update((d) => { d.shop.name = name.trim() || '我的小摊'; })} />
          <div className="label">桌号数量（1–20）</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="sqbtn" onClick={() => update((d) => { d.shop.tableCount = Math.max(1, d.shop.tableCount - 1); })}>−</button>
            <b style={{ fontSize: 20 }}>{db.shop.tableCount}</b>
            <button className="sqbtn" onClick={() => update((d) => { d.shop.tableCount = Math.min(20, d.shop.tableCount + 1); })}>＋</button>
            {online && <button className="mini ok" onClick={() => nav('#/qr')}>生成桌号二维码</button>}
          </div>
        </div>

        <div className="card">
          <b>语音播报</b>
          <div className="row" style={{ marginTop: 4 }}>
            <div className="grow">新单 / 加单 / 呼叫 / 叫号 自动播报</div>
            <button className="btn" style={{ padding: '8px 14px' }}
                    onClick={() => update((d) => { d.shop.voice = !d.shop.voice; })}>
              {db.shop.voice ? '已开启' : '已关闭'}
            </button>
          </div>
          <div className="row">
            <div className="grow">音量</div>
            <input type="range" min="0" max="1" step="0.1" value={db.shop.volume ?? 1}
                   onChange={(e) => update((d) => { d.shop.volume = Number(e.target.value); })} />
          </div>
          <button className="btn block" style={{ marginTop: 10 }}
                  onClick={() => say('1号桌，羊肉串5份，啤酒2份')}>▶ 试听播报</button>
          <div className="sub" style={{ marginTop: 8 }}>嘈杂环境记得同时开手机媒体音量；呼叫会附带震动和卡片闪烁。</div>
        </div>

        <div className="card">
          <b>联机（顾客扫码点单）</b>
          {!online ? (
            <>
              <div className="sub" style={{ margin: '4px 0 8px' }}>登录后：菜单发布上云、顾客 H5 扫码下单实时播报。需要先用 <code>scripts/pb-setup.mjs</code> 初始化云端集合。</div>
              <div className="label">服务器</div>
              <input className="f" value={db.shop.pbBase || DEFAULT_BASE}
                     onChange={(e) => update((d) => { d.shop.pbBase = e.target.value.trim(); })} />
              <div className="label">账号（邮箱）</div>
              <input className="f" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <div className="label">密码</div>
              <input className="f" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="至少 8 位" />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn primary" style={{ flex: 1 }} disabled={busy || !email || !pass} onClick={() => doLogin(false)}>登录</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !email || !pass} onClick={() => doLogin(true)}>注册</button>
              </div>
            </>
          ) : (
            <>
              <div className="row" style={{ marginTop: 6 }}>
                <div className="grow">状态</div>
                <span className="pill served">已联机</span>
              </div>
              <div className="sub">店铺编号：{db.shop.pbId}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="btn ok" style={{ flex: 1 }} disabled={busy}
                        onClick={async () => { setBusy(true); setMsg(await publishMenu(db) ? '菜单已发布' : '发布失败（离线？）'); setBusy(false); }}>发布菜单</button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => nav('#/qr')}>桌号二维码</button>
              </div>
              <button className="mini" style={{ marginTop: 12 }} disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const { getClient } = await import('../sync.js');
                          getClient(db.shop.pbBase).authStore.clear();
                          update((d) => { delete d.shop.pbId; });
                          setMsg('已退出联机');
                        } finally { setBusy(false); }
                      }}>退出登录</button>
            </>
          )}
          {msg && <div className="sub" style={{ marginTop: 8 }}>{msg}</div>}
        </div>

        <div className="card">
          <b>数据</b>
          <div className="sub" style={{ margin: '4px 0 10px' }}>订单数据优先存本机（IndexedDB），联机后菜单与进单走云端中转。</div>
          <button className="btn danger block" onClick={() => setAskReset(true)}>清空并重置演示数据</button>
        </div>

        <div className="sub" style={{ textAlign: 'center' }}>摊主点单助手 V0.2 · 只记单不碰支付</div>
      </div>

      {askReset && (
        <div className="mask" onClick={() => setAskReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>清空全部订单和数据？</h3>
            <div className="sub">将恢复到初始演示数据，不可撤销。</div>
            <div className="mfoot">
              <button className="btn" onClick={() => setAskReset(false)}>取消</button>
              <button className="btn danger" onClick={async () => {
                const { set: idbSet } = await import('idb-keyval');
                await idbSet('stall-db-v1', undefined);
                location.reload();
              }}>确认清空</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
