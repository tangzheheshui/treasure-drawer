import React, { useEffect, useRef, useState } from 'react';

// 状态机：setup 设置 → waiting 倒计时 → ringing iPhone 锁屏来电 → incall 通话中
export default function App() {
  const [state, setState] = useState('setup');
  const [name, setName] = useState(() => localStorage.getItem('fc.name') || '妈妈');
  const [delay, setDelay] = useState(() => Number(localStorage.getItem('fc.delay') ?? 3));
  const [ring, setRing] = useState(() => localStorage.getItem('fc.ring') !== '0');
  const [secs, setSecs] = useState(0);
  const timer = useRef(null);
  const audio = useRef(null);
  const vib = useRef(null);

  useEffect(() => {
    localStorage.setItem('fc.name', name);
    localStorage.setItem('fc.delay', String(delay));
    localStorage.setItem('fc.ring', ring ? '1' : '0');
  }, [name, delay, ring]);

  const stopRing = () => {
    clearInterval(vib.current);
    if (audio.current) { clearInterval(audio.current._iv); audio.current.close().catch(() => {}); audio.current = null; }
  };
  useEffect(() => () => { clearTimeout(timer.current); stopRing(); }, []);

  const start = () => {
    clearTimeout(timer.current);
    setState('waiting');
    timer.current = setTimeout(() => {
      setState('ringing');
      if (ring) startRing();
    }, Math.max(0, delay) * 1000);
  };

  // 铃声：WebAudio 合成的三音上行，循环（免音频素材、零依赖）
  function startRing() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      audio.current = ac;
      const note = (f, t, d = 0.24) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = ac.currentTime + t;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
        o.connect(g); g.connect(ac.destination);
        o.start(t0); o.stop(t0 + d + 0.05);
      };
      const bar = () => { note(1318.5, 0); note(1568, 0.24); note(2093, 0.48); };
      bar();
      audio.current._iv = setInterval(bar, 2600);
      navigator.vibrate && navigator.vibrate([600, 400]);
      vib.current = setInterval(() => navigator.vibrate && navigator.vibrate([600, 400]), 1500);
    } catch { /* 无声环境 */ }
  }

  const answer = () => { stopRing(); setSecs(0); setState('incall'); };
  const decline = () => { stopRing(); clearTimeout(timer.current); setState('setup'); };

  useEffect(() => {
    if (state !== 'incall') return;
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [state]);

  const now = new Date();
  const clock = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;
  const hue = [...name].reduce((a, c) => a + c.codePointAt(0), 0) % 360;
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  if (state === 'setup' || state === 'waiting') {
    return (
      <div className="wrap">
        <div className="card">
          <div className="avatar" style={{ background: `hsl(${hue} 55% 45%)` }}>{name[0]}</div>
          <input className="fcName" value={name} onChange={(e) => setName(e.target.value.slice(0, 12))} placeholder="来电人" />
          <label className="row">几秒后来电
            <input type="number" min={0} max={60} value={delay} onChange={(e) => setDelay(Math.min(60, Math.max(0, Number(e.target.value) || 0)))} />
            <span>秒</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={ring} onChange={(e) => setRing(e.target.checked)} /> 响铃 + 震动
          </label>
          {state === 'waiting'
            ? <button className="go cancel" onClick={decline}>取消（{delay} 秒后来电）</button>
            : <button className="fcStart go" onClick={start}>📞 开始模拟</button>}
          <p className="tip">记得调大媒体音量；纯本地模拟，谁也打不进来</p>
        </div>
      </div>
    );
  }

  if (state === 'ringing') {
    return (
      <div className="lock ringing">
        <div className="status">{clock}</div>
        <div className="dateLine">{date}</div>
        <div className="mid">
          <div className="avatar big" style={{ background: `hsl(${hue} 55% 45%)` }}>{name[0]}</div>
          <div className="who">{name}</div>
          <div className="sub">iPhone</div>
        </div>
        <div className="actions">
          <button className="act decline" onClick={decline}><span className="ic">✕</span>拒绝</button>
          <button className="act answer" onClick={answer}><span className="ic">📞</span>接听</button>
        </div>
        <div className="homebar" />
      </div>
    );
  }

  return (
    <div className="call">
      <div className="status">{clock}</div>
      <div className="mid">
        <div className="avatar big dim" style={{ background: `hsl(${hue} 55% 45%)` }}>{name[0]}</div>
        <div className="who">{name}</div>
        <div className="sub">{mmss}</div>
      </div>
      <div className="grid">
        {['🔇 静音', '⌨️ 键盘', '🔊 扬声器', '➕ 添加', '📹 FaceTime', '👤 联系人'].map((t) => (
          <div className="g" key={t}><span className="gi">·</span>{t.split(' ')[1]}</div>
        ))}
      </div>
      <div className="endRow">
        <button className="act end" onClick={decline}><span className="ic">✕</span>结束</button>
      </div>
      <div className="homebar" />
    </div>
  );
}
