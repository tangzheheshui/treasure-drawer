import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// 桌号二维码：顾客 H5 入口（?s=店铺 & t=桌号 & b=服务器）。可逐张下载或整页打印张贴。
export default function Qr({ db, nav }) {
  const [codes, setCodes] = useState(null);

  useEffect(() => {
    (async () => {
      const page = location.origin + location.pathname.replace(/[^/]*$/, '') + 'customer.html';
      const b = db.shop.pbBase || '';
      const arr = [];
      for (let no = 1; no <= db.shop.tableCount; no++) {
        const url = `${page}?s=${db.shop.pbId}&t=${no}&b=${encodeURIComponent(b)}`;
        arr.push({ no, url, img: await QRCode.toDataURL(url, { width: 300, margin: 1 }) });
      }
      setCodes(arr);
    })();
  }, [db.shop.pbId, db.shop.tableCount]);

  return (
    <>
      <div className="nav no-print">
        <button className="back" onClick={() => nav('#/settings')}>← 返回</button>桌号二维码
        <button className="act" onClick={() => window.print()}>打印张贴</button>
      </div>
      <div className="page">
        {!db.shop.pbId && <div className="card">先到「设置 → 联机」登录，生成店铺编号后才能出码。</div>}
        {db.shop.pbId && !codes && <div className="card sub">生成中…</div>}
        {codes && (
          <div className="qr-grid">
            {codes.map((c) => (
              <div className="qr-card" key={c.no}>
                <img src={c.img} alt={`${c.no}号桌`} />
                <b>{c.no}号桌</b>
                <a className="sub no-print" href={c.img} download={`桌号二维码-${c.no}.png`}>下载</a>
              </div>
            ))}
          </div>
        )}
        <div className="sub no-print" style={{ textAlign: 'center', marginTop: 10 }}>
          顾客扫码直达点单页（不用装任何 App）。换桌号数量后重新打印。
        </div>
      </div>
    </>
  );
}
