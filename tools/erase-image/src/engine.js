// 图片擦除 · 画布引擎：原图层 + 工作层 + 视图变换 + 笔迹 + 撤销栈。
// 纯 Canvas2D，无第三方依赖；撤销以「笔」为一步，存落笔前逐点补丁 + 整笔落笔后快照。
const MAX_EDGE = 4096;   // 长边上限，超大图先压进来
const UNDO_MAX = 50;
const TAU = Math.PI * 2;

export class EraseEngine {
  constructor() {
    this.base = document.createElement('canvas'); // 原图，永不改动（智能取样/橡皮的依据）
    this.work = document.createElement('canvas'); // 当前合成 = 原图 + 已落的笔
    this.bctx = this.base.getContext('2d', { willReadFrequently: true });
    this.wctx = this.work.getContext('2d', { willReadFrequently: true });
    this.view = { scale: 1, x: 0, y: 0 };          // 图片→屏幕：screen = img * scale + offset
    this.undoStack = [];
    this.redoStack = [];
    this.cur = null;                                // 进行中的一笔
    this.hasImage = false;
  }

  get dims() { return { w: this.work.width, h: this.work.height }; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  async open(file) {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    const k = long > MAX_EDGE ? MAX_EDGE / long : 1;
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    this.base.width = this.work.width = w;
    this.base.height = this.work.height = h;
    this.bctx.drawImage(bmp, 0, 0, w, h);
    this.wctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    this.undoStack = []; this.redoStack = []; this.cur = null;
    this.hasImage = true;
    return { w, h, scaled: k < 1 };
  }

  fit(vw, vh) {
    const { w, h } = this.dims;
    const s = Math.min(vw / w, vh / h) * 0.96;
    this.view = { scale: s, x: (vw - w * s) / 2, y: (vh - h * s) / 2 };
  }

  zoomAt(sx, sy, factor) {
    const v = this.view;
    const ns = Math.min(40, Math.max(0.02, v.scale * factor));
    const k = ns / v.scale;
    v.x = sx - (sx - v.x) * k;
    v.y = sy - (sy - v.y) * k;
    v.scale = ns;
  }

  panBy(dx, dy) { this.view.x += dx; this.view.y += dy; }

  toImage(sx, sy) {
    const v = this.view;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  render(ctx, vw, vh) {
    ctx.fillStyle = '#26282c';
    ctx.fillRect(0, 0, vw, vh);
    const v = this.view, { w, h } = this.dims;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.work, v.x, v.y, w * v.scale, h * v.scale);
  }

  pick(sx, sy) {
    const p = this.toImage(sx, sy);
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= this.work.width || y >= this.work.height) return null;
    const d = this.wctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], css: `rgb(${d[0]},${d[1]},${d[2]})` };
  }

  // ── 笔迹：brush 涂色 / eraser 恢复原图 ──
  begin(kind, pt, size, color) {
    this.cur = { kind, size, color: color || null, patches: [], bbox: null, touched: false, _last: [pt.x, pt.y] };
    this._stamp(pt.x, pt.y);
  }

  extend(pt) {
    if (!this.cur) return;
    const [lx, ly] = this.cur._last;
    const dist = Math.hypot(pt.x - lx, pt.y - ly);
    const step = Math.max(this.cur.size / 5, 1.5);
    if (dist < step * 0.6) return;
    const n = Math.max(1, Math.floor(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = Math.min((i * step) / dist, 1);
      this._stamp(lx + (pt.x - lx) * t, ly + (pt.y - ly) * t);
    }
    this.cur._last = [pt.x, pt.y];
  }

  end() {
    if (!this.cur) return;
    if (!this.cur.touched || !this.cur.bbox) { this.cur = null; return; } // 没碰到画布，不算一步
    this.undoStack.push({ befores: this.cur.patches, after: this._snapshot(this.cur.bbox) });
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack = [];
    this.cur = null;
  }

  cancel() { // 双指切进：进行中的整笔回退，不算一步
    if (!this.cur) return;
    for (let i = this.cur.patches.length - 1; i >= 0; i--) {
      const p = this.cur.patches[i];
      this.wctx.putImageData(p.before, p.rect.x, p.rect.y);
    }
    this.cur = null;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    for (let i = e.befores.length - 1; i >= 0; i--) {
      const p = e.befores[i];
      this.wctx.putImageData(p.before, p.rect.x, p.rect.y);
    }
    this.redoStack.push(e);
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    this.wctx.putImageData(e.after.data, e.after.rect.x, e.after.rect.y);
    this.undoStack.push(e);
  }

  exportBlob(type, quality) {
    return new Promise((resolve) => this.work.toBlob(resolve, type, quality));
  }

  exportDataURL(type, quality) {
    return this.work.toDataURL(type, quality);
  }

  // ── 内部 ──
  _stamp(x, y) {
    const { kind, size, color } = this.cur;
    const r = size / 2;
    const rect = this._rectFor(x, y, r);
    if (!rect) return;
    this.cur.patches.push({ rect, before: this.wctx.getImageData(rect.x, rect.y, rect.w, rect.h) });
    this.cur.bbox = this.cur.bbox ? _union(this.cur.bbox, rect) : { ...rect };

    if (kind === 'eraser') {
      const c = this.wctx;
      c.save();
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.clip();
      c.drawImage(this.base, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
      c.restore();
    } else {
      const c = this.wctx;
      c.fillStyle = color ? color.css : this._ringColor(x, y, r);
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    this.cur.touched = true;
  }

  _rectFor(x, y, r) {
    const m = 2;
    const x0 = Math.max(0, Math.floor(x - r - m));
    const y0 = Math.max(0, Math.floor(y - r - m));
    const x1 = Math.min(this.work.width, Math.ceil(x + r + m));
    const y1 = Math.min(this.work.height, Math.ceil(y + r + m));
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  _snapshot(bbox) {
    const x = Math.max(0, Math.floor(bbox.x)), y = Math.max(0, Math.floor(bbox.y));
    const x1 = Math.min(this.work.width, Math.ceil(bbox.x + bbox.w));
    const y1 = Math.min(this.work.height, Math.ceil(bbox.y + bbox.h));
    const rect = { x, y, w: x1 - x, h: y1 - y };
    return { rect, data: this.wctx.getImageData(rect.x, rect.y, rect.w, rect.h) };
  }

  // 智能取样：以落点为心在已涂层上取两圈环带样本。要挑的是「背景色」——
  // 规则：与被盖像素（原图落点色）明显不同的样本才算背景候选；够数就取其均值，
  // 不够（周围本来没异物）就取全部样本均值。最后加 ±1.5 微噪声贴合压缩噪点。
  _ringColor(cx, cy, r) {
    const R1 = r * 1.5 + 4, R2 = r * 2.2 + 6;
    const W = this.work.width, H = this.work.height;
    const x0 = Math.max(0, Math.floor(cx - R2)), y0 = Math.max(0, Math.floor(cy - R2));
    const x1 = Math.min(W, Math.ceil(cx + R2)), y1 = Math.min(H, Math.ceil(cy + R2));
    if (x1 <= x0 || y1 <= y0) return '#808080';
    const d = this.wctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const self = this.bctx.getImageData(Math.min(W - 1, Math.max(0, Math.floor(cx))), Math.min(H - 1, Math.max(0, Math.floor(cy))), 1, 1).data;
    const w = x1 - x0, samples = [];
    const N = 18;
    for (let i = 0; i < N; i++) {
      const ring = i % 2 ? R1 : R2;
      const a = (i / N) * TAU + Math.random() * 0.3;
      const px = Math.round(cx + Math.cos(a) * ring) - x0;
      const py = Math.round(cy + Math.sin(a) * ring) - y0;
      if (px < 0 || py < 0 || px >= w || py >= y1 - y0) continue;
      const o = (py * w + px) * 4;
      samples.push([d[o], d[o + 1], d[o + 2]]);
    }
    if (!samples.length) return '#808080';
    const dist = (s) => Math.hypot(s[0] - self[0], s[1] - self[1], s[2] - self[2]);
    const far = samples.filter((s) => dist(s) > 60);
    const pick = far.length >= Math.max(3, samples.length / 4) ? far : samples;
    const avg = pick.reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]).map((v) => v / pick.length);
    const jit = (v) => Math.max(0, Math.min(255, Math.round(v + (Math.random() * 3 - 1.5))));
    return `rgb(${jit(avg[0])},${jit(avg[1])},${jit(avg[2])})`;
  }
}

function _union(b, r) {
  const x1 = Math.max(b.x + b.w, r.x + r.w), y1 = Math.max(b.y + b.h, r.y + r.h);
  b.x = Math.min(b.x, r.x); b.y = Math.min(b.y, r.y);
  b.w = x1 - b.x; b.h = y1 - b.y;
  return b;
}
