import React, { useEffect, useRef, useState } from 'react';

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const SHEET_H = 210;   // 台历页高（px），跟手角度映射用
const SWIPE_H = SHEET_H * 1.35; // 手指拖这么多距离 = 翻整页

// 台历：纸页挂在顶部装订轴上。flap = { angle, front, live } 正在翻的那页。
// 上翻（angle 0→-180）= 加分：当前页翻走，底下已露出新页；
// 下翻（angle -180→0）= 减分：搭在轴后的那页翻下来盖住。
function FlipSheet({ base, flap }) {
  return (
    <div className="cal">
      <div className="pageStack">
        <div className="page">{base}</div>
        {flap && (
          <div
            className="flap"
            style={{ transform: `rotateX(${flap.angle}deg)`, transition: flap.live ? 'none' : 'transform 0.32s ease-out' }}
          >
            <div className="face front">{flap.front}</div>
            <div className="face back" />
          </div>
        )}
      </div>
      <div className="hinge" />
    </div>
  );
}

export default function App() {
  const [scores, setScores] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sb.scores')) || { l: 0, r: 0 }; } catch { return { l: 0, r: 0 }; }
  });
  const [chrome, setChrome] = useState(false);          // 单击屏幕呼出的按钮条
  const [live, setLive] = useState(null);               // 正在翻的页 { side, dir, angle, front, live }
  const liveRef = useRef(null);
  const drag = useRef(null);

  const setLiveBoth = (v) => { liveRef.current = v; setLive(v); };

  useEffect(() => { localStorage.setItem('sb.scores', JSON.stringify(scores)); }, [scores]);

  // 首次触摸尝试全屏 + 锁横屏（预览 iframe 里会被权限挡住，静默失败；真机上生效）
  useEffect(() => {
    const go = () => {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
      screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {});
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go);
    return () => window.removeEventListener('pointerdown', go);
  }, []);

  const down = (side) => (e) => { drag.current = { side, y0: e.clientY, t0: Date.now(), moved: false }; };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 8) d.moved = true;
    if (dy < 0) {
      // 上拖：当前页绕顶轴往上翻，底下露出 +1 的新页
      setLiveBoth({ side: d.side, dir: 'up', angle: clampN((dy / SWIPE_H) * 180, -180, 0), front: scores[d.side], live: true });
    } else {
      // 下拖：搭在轴后（-180）的那页翻下来，页面上是要减到的分数
      setLiveBoth({ side: d.side, dir: 'down', angle: clampN(-180 + (dy / SWIPE_H) * 180, -180, 0), front: scores[d.side] - 1, live: true });
    }
  };

  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Date.now() - d.t0 < 350) { setLiveBoth(null); setChrome(c => !c); return; } // 单击：呼出/收起按钮条
    const L = liveRef.current;
    if (!L || L.side !== d.side) { setLiveBoth(null); return; }
    if (L.dir === 'up') {
      if (L.angle < -70) {  // 翻过大半 → 加 1，让页翻到底
        setScores(s => ({ ...s, [d.side]: clampN(s[d.side] + 1, -999, 999) }));
        setLiveBoth({ ...L, angle: -180, live: false });
      } else {
        setLiveBoth({ ...L, angle: 0, live: false }); // 弹回
      }
    } else if (L.angle > -110) { // 拉下来大半 → 减 1，页翻平盖住
      setScores(s => ({ ...s, [d.side]: clampN(s[d.side] - 1, -999, 999) }));
      setLiveBoth({ ...L, angle: 0, live: false });
    } else {
      setLiveBoth({ ...L, angle: -180, live: false }); // 收回轴后
    }
    setTimeout(() => setLiveBoth(null), 360);
  };

  // 上翻期间底页直接露出 +1 的值（被翻走的页盖不住的部分）
  const baseOf = (side) => (live && live.side === side && live.dir === 'up' ? scores[side] + 1 : scores[side]);
  const flapOf = (side) => (live && live.side === side ? live : null);

  return (
    <div className="app">
      <div className={`bar ${chrome ? 'show' : ''}`}>
        <button onClick={() => history.back()}>← 返回</button>
        <button onClick={() => setScores({ l: 0, r: 0 })}>归零</button>
      </div>
      <div className="side l" onPointerDown={down('l')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <FlipSheet base={baseOf('l')} flap={flapOf('l')} />
      </div>
      <div className="side r" onPointerDown={down('r')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <FlipSheet base={baseOf('r')} flap={flapOf('r')} />
      </div>
      <div className="rotate">请横屏使用 🔄</div>
    </div>
  );
}
