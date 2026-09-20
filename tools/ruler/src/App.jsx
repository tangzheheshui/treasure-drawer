import React, { useEffect, useRef, useState } from 'react';

// 真实尺寸自动定标：刻度代表真实物理长度，固定不可调。
// 内置常见 iPhone / iPad 机型表（逻辑分辨率@dpr → 物理 PPI），没匹配上就按屏幕密度估算。
const DEVICES = {
  '320x568@2': ['iPhone 5 / SE（1 代）', 326],
  '375x667@2': ['iPhone 6/7/8 / SE（2/3 代）', 326],
  '375x812@3': ['iPhone X/XS/11 Pro / 12/13 mini', 458],
  '390x844@3': ['iPhone 12/13/14', 460],
  '393x852@3': ['iPhone 14 Pro / 15 / 16', 460],
  '402x874@3': ['iPhone 16 Pro / 17 / 17 Pro', 460],
  '414x736@3': ['iPhone 6/7/8 Plus', 401],
  '414x896@2': ['iPhone XR / 11', 326],
  '414x896@3': ['iPhone XS Max / 11 Pro Max', 458],
  '420x912@3': ['iPhone Air', 460],
  '428x926@3': ['iPhone 12/13 Pro Max / 14 Plus', 458],
  '430x932@3': ['iPhone 14 Pro Max / 15/16 Plus / 15 Pro Max', 460],
  '440x956@3': ['iPhone 16 Pro Max / 17 Pro Max', 460],
  '744x1133@2': ['iPad mini（6/7 代）', 326],
  '810x1080@2': ['iPad（10.2 英寸）', 264],
  '820x1180@2': ['iPad Air（4/5 代）/ iPad（10 代）', 264],
  '834x1112@2': ['iPad Air / Pro（10.5 英寸）', 222],
  '834x1194@2': ['iPad Pro（11 英寸）', 264],
  '1024x1366@2': ['iPad Pro（12.9/13 英寸）', 264],
};

function detectDevice() {
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const hit = DEVICES[`${w}x${h}@${dpr}`];
  if (hit) return { name: hit[0], ppi: hit[1] };
  return { name: `未识别的机型，按屏幕密度 ${dpr}× 估算`, ppi: Math.round(dpr * 155) };
}

export default function App() {
  const canvasRef = useRef(null);
  const drawRef = useRef(null);
  const [device] = useState(detectDevice);
  const [panel, setPanel] = useState(false);

  // 画布铺满窗口（全屏标尺），转屏时 ResizeObserver 触发重画
  useEffect(() => {
    const cv = canvasRef.current;
    const draw = drawRef;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      draw.current && draw.current();
    });
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  drawRef.current = () => {
    const cv = canvasRef.current;
    if (!cv || !cv.width) return;
    const ctx = cv.getContext('2d');
    const W = cv.clientWidth, H = cv.clientHeight;
    const land = W > H;                    // 横着拿：尺子躺到顶缘、0 点在左
    const L = land ? W : H;
    const ppcm = device.ppi / 2.54 / (window.devicePixelRatio || 1); // 每厘米屏幕像素，本机固定值
    const mm = ppcm / 10;

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1f2329';
    ctx.fillStyle = '#1f2329';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 本地坐标：u = 沿尺身离 0 点的距离，v = 离量测长边的距离（刻度只在这一条边、只朝里）。
    // 竖屏贴左缘、0 点在上：(u,v)→屏(x=v, y=u)；横屏贴上缘、0 点在左：(u,v)→屏(x=u, y=v)。
    const put = (u, v) => (land ? [u, v] : [v, u]);
    const seg = (u1, v1, u2, v2, lw) => {
      const a = put(u1, v1), b = put(u2, v2);
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    };
    // 数字永远立正对着持机人：横拿时与最长边垂直，不跟着尺身转
    const label = (u, v, s) => { const [x, y] = put(u, v); ctx.fillText(s, x, y); };

    // 量测边贴边线
    seg(0, 2, L, 2, 2);

    for (let i = 0; ; i++) {
      const u = i * mm;
      if (u > L) break;
      const cm = i % 10 === 0, half = i % 5 === 0;
      seg(u, 3, u, 3 + (cm ? 24 : half ? 15 : 9), 1);
      if (cm) label(Math.min(Math.max(u, 9), L - 9), 42, String(i / 10));
    }
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  };

  const pxPerCm = Math.round(device.ppi / 2.54 / (window.devicePixelRatio || 1));

  return (
    <div className="app">
      <canvas ref={canvasRef} />
      <button className="gear" onClick={() => setPanel(p => !p)} title="设置">⚙</button>
      {panel && (
        <div className="panel">
          <p className="ptitle">刻度按本机屏幕真实尺寸自动定标，固定不可调</p>
          <p className="pval">{device.name} · {device.ppi} PPI · 1 厘米 ≈ {pxPerCm} 像素</p>
          <button className="pbtn" onClick={fullscreen}>全屏</button>
        </div>
      )}
      <div className="hint">竖拿贴左缘、横拿贴上缘 · 0 点在边上 · 刻度即真实尺寸</div>
    </div>
  );
}
