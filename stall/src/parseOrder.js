// 语音点菜解析：把识别出的话整理成「菜 + 数量」的单子预览。
// 纯函数、零依赖，浏览器与 Node（自检 check.mjs）都能直接跑。
// 方案拍板：不接付费大模型——识别交给浏览器内置 ASR，解析用本地模糊匹配
// （菜单就十几道，本地匹配够用、零成本、零延迟）；将来若准度不够，
// 保持 parseOrderTranscript 的出入参，单独换这个文件的实现即可。

const NUM_CH = { 零: 0, 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const MEASURE = '串份瓶个杯盘把听罐扎碗根支包盒桶碟条块箱手打';
const FILL_WORDS = ['麻烦', '老板', '给我', '我要', '想要', '帮忙', '还有', '然后', '以及', '一下', '再来', '先来', '来点', '我们'];
const FILL_CHARS = '和跟请先再来要';

// 去掉标点/口语垫话，只留「菜名 + 数字 + 量词」的干料
function clean(t) {
  let s = (t || '').replace(/[\s，。！？、,.!?~…：:；;（）()「」『』"'·\-]+/g, '');
  FILL_WORDS.forEach((w) => { s = s.split(w).join(''); });
  return s.split('').filter((ch) => !FILL_CHARS.includes(ch)).join('');
}

const isNumChar = (c) => (c >= '0' && c <= '9') || c in NUM_CH || c === '十' || c === '百';

// 数字串 → 数值：阿拉伯直接转；中文支持十/百组合（两=2、二十三=23、一百二=120）
function cnNum(run) {
  if (run[0] >= '0' && run[0] <= '9') return parseInt(run, 10) || 0;
  if (run.includes('百')) {
    const [h, rest = ''] = run.split('百');
    return (NUM_CH[h] || 1) * 100 + (rest ? cnNum(rest) : 0);
  }
  if (run.includes('十')) {
    const [a, b = ''] = run.split('十');
    return (a ? NUM_CH[a] || 1 : 1) * 10 + (b ? NUM_CH[b] || 0 : 0);
  }
  return NUM_CH[run[0]] ?? 0; // 「两三串」这类取首字
}

const bigrams = (s) => { const o = []; for (let i = 0; i + 1 < s.length; i++) o.push(s.slice(i, i + 2)); return o; };

// 在未占用段 [lo,hi) 里滑窗，找与菜名最像的窗口（双字 Dice 相似度，容忍错字/插字）
function fuzzyAt(text, lo, hi, name) {
  if (hi - lo < name.length - 1) return null;
  const nb = bigrams(name);
  if (!nb.length) return null;
  let best = null;
  for (let len = name.length - 1; len <= name.length + 1; len++) {
    for (let s = lo; s + len <= hi; s++) {
      const wb = bigrams(text.slice(s, s + len));
      if (!wb.length) continue;
      const common = wb.filter((b) => nb.includes(b)).length;
      const score = (2 * common) / (nb.length + wb.length);
      if (!best || score > best.score) best = { s, e: s + len, score };
    }
  }
  return best;
}

// 主入口：raw=识别出的原话，dishes=当前菜单（售罄的不参与）
// 返回 { text 原话, items:[{dishId,name,qty,fuzzy}], leftover 没对上号的尾巴 }
export function parseOrderTranscript(raw, dishes) {
  const text = clean(raw);
  const n = text.length;
  const avail = (dishes || []).filter((d) => d && d.name && !d.soldOut);
  const sorted = [...avail].sort((a, b) => b.name.length - a.name.length); // 长名优先，防「羊肉串」吃掉「羊肉串炒饭」
  const used = new Array(n).fill(false);
  const hits = []; // { dish, s, e, qty|null, fuzzy }

  // 1) 精确匹配
  for (const d of sorted) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(d.name, from);
      if (i < 0) break;
      from = i + d.name.length;
      if (used.slice(i, i + d.name.length).some(Boolean)) continue;
      for (let k = i; k < i + d.name.length; k++) used[k] = true;
      hits.push({ dish: d, s: i, e: i + d.name.length, qty: null, fuzzy: false });
    }
  }

  // 2) 模糊匹配（识别带错字时兜底）：全局找最佳窗口，认掉一段再找下一段
  for (let guard = 0; guard < 50; guard++) {
    let bd = null;
    for (let s = 0; s < n; s++) {
      if (used[s]) continue;
      let e = s; while (e < n && !used[e]) e++;
      for (const d of sorted) {
        if (d.name.length < 2 || hits.some((h) => h.dish === d)) continue;
        const m = fuzzyAt(text, s, e, d.name);
        if (m && m.score >= (d.name.length >= 3 ? 0.5 : 1) && (!bd || m.score > bd.score)) {
          bd = { ...m, dish: d };
        }
      }
      s = e;
    }
    if (!bd) break;
    for (let k = bd.s; k < bd.e; k++) used[k] = true;
    hits.push({ dish: bd.dish, s: bd.s, e: bd.e, qty: null, fuzzy: true });
  }

  // 3) 数字：菜名空隙里找「数 + 量词」，分给离得最近、还没数量的菜
  //    （「十串羊肉串」「羊肉串十串」都通；并列偏左——数量词跟在菜名后面说）
  for (let i = 0; i < n;) {
    if (used[i] || !isNumChar(text[i])) { i++; continue; }
    let j = i; while (j < n && !used[j] && isNumChar(text[j])) j++;
    let e = j;
    if (e < n && !used[e] && MEASURE.includes(text[e])) e++;
    const val = cnNum(text.slice(i, j));
    if (val > 0) {
      const dist = (h) => (h.e <= i ? i - h.e : h.s >= e ? h.s - e : 0);
      const h = hits.filter((x) => x.qty === null).sort((a, b) => dist(a) - dist(b) || a.s - b.s)[0];
      if (h) h.qty = val;
    }
    for (let k = i; k < e; k++) used[k] = true;
    i = e;
  }

  // 4) 出单：同一道菜并成一行的数量；相似度存疑的标 fuzzy 让摊主改
  const items = [];
  hits.sort((a, b) => a.s - b.s).forEach((h) => {
    const ex = items.find((x) => x.dishId === h.dish.id);
    if (ex) { ex.qty += h.qty || 1; ex.fuzzy = ex.fuzzy || h.fuzzy; }
    else items.push({ dishId: h.dish.id, name: h.dish.name, qty: h.qty || 1, fuzzy: h.fuzzy });
  });
  items.forEach((x) => { x.qty = Math.min(999, Math.max(1, x.qty)); });
  const leftover = [...text].filter((c, k) => !used[k] && !MEASURE.includes(c)).join('').slice(0, 24);
  return { text: (raw || '').trim(), items, leftover };
}
