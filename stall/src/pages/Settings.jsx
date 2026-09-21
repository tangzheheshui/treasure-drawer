import React, { useState } from 'react';
import { seed } from '../store.js';
import { say } from '../voice.js';

export default function Settings({ db, update }) {
  const [name, setName] = useState(db.shop.name);
  const [askReset, setAskReset] = useState(false);

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
            <span className="sub">桌边二维码贴纸在顾客 H5 上线后批量生成</span>
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
            <input type="range" min="0" max="1" step="0.1" value={db.shop.volume}
                   onChange={(e) => update((d) => { d.shop.volume = Number(e.target.value); })} />
          </div>
          <button className="btn block" style={{ marginTop: 10 }}
                  onClick={() => say('1号桌，羊肉串5份，啤酒2份')}>▶ 试听播报</button>
          <div className="sub" style={{ marginTop: 8 }}>嘈杂环境记得同时开手机媒体音量；呼叫会附带震动和卡片闪烁。</div>
        </div>

        <div className="card">
          <b>数据</b>
          <div className="sub" style={{ margin: '4px 0 10px' }}>全部数据只存本机（IndexedDB）。联机阶段接入自有 PocketBase 云备份。</div>
          <button className="btn danger block" onClick={() => setAskReset(true)}>清空并重置演示数据</button>
        </div>

        <div className="sub" style={{ textAlign: 'center' }}>摊主点单助手 V0.1 · 纯本地点单，不碰支付</div>
      </div>

      {askReset && (
        <div className="mask" onClick={() => setAskReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>清空全部订单和数据？</h3>
            <div className="sub">将恢复到初始演示数据，不可撤销。</div>
            <div className="mfoot">
              <button className="btn" onClick={() => setAskReset(false)}>取消</button>
              <button className="btn danger" onClick={async () => {
                const { get: idbGet, set: idbSet } = await import('idb-keyval');
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
