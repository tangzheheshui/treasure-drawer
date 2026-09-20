import React, { useEffect, useRef, useState } from 'react';
import { Slider, Toast, Dialog } from 'antd-mobile';
import { EraseEngine } from './engine.js';
import { IconPicker, IconBrush, IconEraser, IconUndo, IconRedo, IconSave, IconImage } from './icons.jsx';

export default function App() {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new EraseEngine();
  const engine = engineRef.current;

  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);      // {dist, mx, my}
  const strokeOn = useRef(false);
  const panning = useRef(null);
  const spaceRef = useRef(false);
  const staleRef = useRef(false);  // 双指抬剩一指：忽略到全部抬起，防误画
  const userMoved = useRef(false); // 用户主动缩放/平移过视图
  const metaRef = useRef({ png: false, base: 'image' });

  const [hasImage, setHasImage] = useState(false);
  const [tool, setTool] = useState('brush'); // brush | picker | eraser
  const [size, setSize] = useState(36);
  const [picked, setPicked] = useState(null); // null = 智能取样；{css} = 手动固定色
  const [flags, setFlags] = useState({ u: false, r: false });

  const toolRef = useRef(tool); toolRef.current = tool;
  const sizeRef = useRef(size); sizeRef.current = size;
  const pickedRef = useRef(picked); pickedRef.current = picked;

  const syncFlags = () => setFlags({ u: engine.canUndo, r: engine.canRedo });

  function render() {
    const cv = canvasRef.current;
    if (!cv || !cv.width) return;
    engine.render(cv.getContext('2d'), cv.clientWidth, cv.clientHeight);
  }

  // 画布随容器尺寸/像素密度重设；用户没动过视图就重新居中（工具栏出现会改变画布高度）
  useEffect(() => {
    const cv = canvasRef.current;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      if (engine.hasImage && !userMoved.current) engine.fit(cv.clientWidth, cv.clientHeight);
      render();
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  function openFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const name = file.name || 'image';
    metaRef.current = { png: file.type === 'image/png' || /\.png$/i.test(name), base: name.replace(/\.[^.]+$/, '') || 'image' };
    engine.open(file).then(({ w, h, scaled }) => {
      const cv = canvasRef.current;
      engine.fit(cv.clientWidth, cv.clientHeight);
      setHasImage(true);
      syncFlags();
      render();
      if (scaled) Toast.show({ content: `大图已缩放到 ${w}×${h}` });
    }).catch(() => Toast.show({ content: '这张图打不开' }));
  }

  // 拖拽 / 粘贴（电脑）
  useEffect(() => {
    const onDragOver = (e) => e.preventDefault();
    const onDrop = (e) => { e.preventDefault(); openFile(e.dataTransfer.files && e.dataTransfer.files[0]); };
    const onPaste = (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const it = [...items].find((i) => i.type.startsWith('image/'));
      if (it) openFile(it.getAsFile());
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  function doUndo() { engine.undo(); syncFlags(); render(); }
  function doRedo() { engine.redo(); syncFlags(); render(); }

  // 快捷键：空格临时平移；Ctrl/⌘+Z 撤销，+Shift/+Y 重做
  useEffect(() => {
    const kd = (e) => {
      if (e.code === 'Space') { spaceRef.current = true; return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); doRedo(); }
    };
    const ku = (e) => { if (e.code === 'Space') spaceRef.current = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  // 滚轮以光标为中心缩放（含触控板捏合的 ctrl+wheel）；要 non-passive 才能 preventDefault
  useEffect(() => {
    const cv = canvasRef.current;
    const onWheel = (e) => {
      if (!engine.hasImage) return;
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      engine.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(2, -e.deltaY * 0.0025));
      userMoved.current = true;
      render();
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e) => {
    if (!engine.hasImage) return;
    canvasRef.current.setPointerCapture && canvasRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = local(e);

    if (pointers.current.size === 1) {
      if (spaceRef.current || e.button === 1) { panning.current = p; return; }
      if (toolRef.current === 'picker') {
        const c = engine.pick(p.x, p.y);
        if (c) { setPicked({ css: c.css }); Toast.show({ content: c.css }); }
        setTool('brush');
        pointers.current.delete(e.pointerId);
        return;
      }
      strokeOn.current = true;
      engine.begin(toolRef.current, engine.toImage(p.x, p.y), sizeRef.current, pickedRef.current);
      render();
    } else if (pointers.current.size === 2) {
      if (strokeOn.current) { engine.cancel(); strokeOn.current = false; }
      const pts = [...pointers.current.values()];
      const mx = (pts[0].x + pts[1].x) / 2 - (canvasRef.current.getBoundingClientRect().left);
      const my = (pts[0].y + pts[1].y) / 2 - (canvasRef.current.getBoundingClientRect().top);
      pinch.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, mx, my };
      staleRef.current = false;
    }
  };

  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = local(e);

    if (pointers.current.size >= 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const mx = (pts[0].x + pts[1].x) / 2 - (canvasRef.current.getBoundingClientRect().left);
      const my = (pts[0].y + pts[1].y) / 2 - (canvasRef.current.getBoundingClientRect().top);
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      engine.zoomAt(pinch.current.mx, pinch.current.my, dist / pinch.current.dist);
      engine.panBy(mx - pinch.current.mx, my - pinch.current.my);
      userMoved.current = true;
      pinch.current = { dist, mx, my };
      render();
      return;
    }
    if (panning.current) {
      engine.panBy(p.x - panning.current.x, p.y - panning.current.y);
      userMoved.current = true;
      panning.current = p;
      render();
      return;
    }
    if (strokeOn.current) {
      engine.extend(engine.toImage(p.x, p.y));
      render();
    }
  };

  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (strokeOn.current) { strokeOn.current = false; engine.end(); syncFlags(); }
      panning.current = null;
      pinch.current = null;
      staleRef.current = false;
      render();
    } else if (pointers.current.size === 1) {
      staleRef.current = true; // 双指剩一指：不画，等全抬
      pinch.current = null;
    }
  };

  function pickNew() {
    if (!engine.hasImage) { fileRef.current.click(); return; }
    Dialog.confirm({ content: '换一张？当前修改不保留', onConfirm: () => fileRef.current.click() });
  }

  // 保存：一键直存，没有中间弹层。
  // 独立打开 = 浏览器原生下载；嵌在预览台等 iframe 里 = 交给宿主页面转存，
  // 宿主不认识协议（0.7s 无回执）就自动开新标签兜底——用户永远只点一下。
  async function doSave() {
    if (!engine.hasImage) return;
    const { png, base } = metaRef.current;
    const name = `${base}-erased.${png ? 'png' : 'jpg'}`;

    if (window.self === window.top) {
      const blob = await engine.exportBlob(png ? 'image/png' : 'image/jpeg', 0.95);
      if (!blob) { Toast.show({ content: '生成失败' }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      Toast.show({ content: '已保存到下载目录，原图没动' });
      return;
    }

    const onAck = (e) => {
      if (e.data && e.data.type === 'save-image-done') {
        window.removeEventListener('message', onAck);
        clearTimeout(timer);
        Toast.show({ content: '已保存到下载目录，原图没动' });
      }
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', onAck);
      engine.exportBlob(png ? 'image/png' : 'image/jpeg', 0.95).then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        window.open(u, '_blank');
        Toast.show({ content: '已在新标签打开图：右键「图片另存为」即可' });
      });
    }, 700);
    window.addEventListener('message', onAck);
    try {
      const url = engine.exportDataURL(png ? 'image/png' : 'image/jpeg', 0.95);
      window.parent.postMessage({ type: 'save-image', url, name }, '*');
    } catch {
      clearTimeout(timer);
      window.removeEventListener('message', onAck);
      Toast.show({ content: '保存失败，重试一次' });
    }
  }

  return (
    <div className="app">
      <div className={`stage ${tool === 'picker' ? 'picking' : ''}`} onContextMenu={(e) => e.preventDefault()}>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {!hasImage && (
          <div className="empty">
            <div className="emptyIcon"><IconEraser /></div>
            <button className="openBtn" onClick={() => fileRef.current.click()}>打开图片</button>
            <p className="hint">涂掉图上不想要的东西 · 纯本地处理，图片不上传</p>
            <p className="hint">电脑可直接拖拽或 Ctrl+V 粘贴图片</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { openFile(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      <div className="toolbar">
        {hasImage && (tool === 'brush' || tool === 'eraser') && (
          <div className="sizeRow">
            {tool === 'brush' && (
              picked
                ? <button className="chip" style={{ background: picked.css }} onClick={() => setPicked(null)} title="点一下回到智能取样" />
                : <span className="chipLabel">智能</span>
            )}
            <Slider value={size} min={4} max={120} onChange={(v) => setSize(Array.isArray(v) ? v[0] : v)} />
          </div>
        )}
        <div className="row">
          <button className={`tb ${tool === 'picker' ? 'on' : ''}`} onClick={() => setTool('picker')} disabled={!hasImage} title="吸管取色"><IconPicker /></button>
          <button className={`tb ${tool === 'brush' ? 'on' : ''}`} onClick={() => setTool('brush')} disabled={!hasImage} title="笔">
            <IconBrush />
            {tool === 'brush' && picked && <i className="dot" style={{ background: picked.css }} />}
          </button>
          <button className={`tb ${tool === 'eraser' ? 'on' : ''}`} onClick={() => setTool('eraser')} disabled={!hasImage} title="橡皮"><IconEraser /></button>
          <span className="sep" />
          <button className="tb" onClick={doUndo} disabled={!flags.u} title="撤销"><IconUndo /></button>
          <button className="tb" onClick={doRedo} disabled={!flags.r} title="重做"><IconRedo /></button>
          <span className="grow" />
          <button className="tb" onClick={pickNew} disabled={!hasImage} title="换一张"><IconImage /></button>
          <button className="save" onClick={doSave} disabled={!hasImage}><IconSave />保存</button>
        </div>
      </div>
    </div>
  );
}
