// 语音识别引擎适配器：点单页只跟这里的接口说话，换引擎不动 UI、不动解析。
//
// 现役两套实现，按配置自动选：
// 1) 浏览器内置 ASR（webkitSpeechRecognition zh-CN，零成本、边说边上屏；iPhone Safari 可用，
//    安卓 Chrome 走谷歌服务国内常不通，微信/套壳 App webview 干脆没有）
// 2) 百度短语音识别（HTTP，浏览器直连、不依赖谷歌；摊主在「设置 → 语音识别」填
//    API Key + Secret Key 即走这套，安卓 / 微信 / 将来套壳 App 通用）
// 不填百度 key 时回退浏览器 ASR。
//
// 接口：
//   asrAvailable(cfg) → bool              有没有可用引擎（没有就藏麦克风按钮）
//   asrLive(cfg) → bool                   是否支持边说边上屏（浏览器 true，百度 false）
//   asrListen(handlers, cfg) → stopFn
//     handlers.onText(全文)    边说边上屏（百度为「一句话识别」没有中途结果，此回调不触发）
//     handlers.onEnd(最终文字) 结束（空串=没听清）
//     handlers.onError(code, msg)  code: not-allowed | unsupported | error
//   cfg = { baiduKey, baiduSecret }（来自 db.shop）

let active = null; // 进行中的会话；新会话开始时自动顶掉旧的

const hasBaidu = (cfg) => !!(cfg && cfg.baiduKey && cfg.baiduSecret);
const webkit = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));

export function asrAvailable(cfg) {
  return hasBaidu(cfg) || !!webkit();
}

export function asrLive(cfg) {
  return !hasBaidu(cfg); // 百度一句话识别无实时结果
}

export function asrListen(handlers, cfg) {
  if (active) { try { active(); } catch { /* 已停 */ } active = null; }
  return hasBaidu(cfg) ? baiduListen(handlers, cfg) : webkitListen(handlers);
}

// ── 浏览器内置 ASR ──
function webkitListen({ onText, onEnd, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError && onError('unsupported', '此浏览器不支持语音识别'); return () => {}; }
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let fin = '';
  rec.onresult = (e) => {
    let mid = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript;
      else mid += e.results[i][0].transcript;
    }
    onText && onText(fin + mid);
  };
  rec.onerror = (e) => onError && onError(e.error || 'error', e.message || '识别出错');
  rec.onend = () => { active = null; onEnd && onEnd(fin.trim()); };
  const stop = () => { try { rec.stop(); } catch { /* 已停 */ } };
  active = stop;
  try { rec.start(); } catch { /* 重复 start 忽略 */ }
  return stop;
}

// ── 百度短语音识别：录音 → 静音检测结束 → 转 16k WAV → base64 → server_api ──
async function baiduListen({ onEnd, onError }, cfg) {
  let stream, audioCtx, rec, raf, stopped = false, speaking = false, silentSince = 0;

  const fail = (code, msg) => { onError && onError(code, msg); };
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { fail('not-allowed', '麦克风没权限，请在浏览器设置里允许后重试'); return () => {}; }

  const AC = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AC();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const volBuf = new Uint8Array(analyser.fftSize);

  rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  rec.onstop = async () => {
    cancelAnimationFrame(raf);
    try { source.disconnect(); } catch { /* 已断 */ }
    stream.getTracks().forEach((t) => t.stop());
    try { audioCtx.close(); } catch { /* 忽略 */ }
    if (!speaking) { onEnd && onEnd(''); return; } // 全程没听到声音，不调接口
    try {
      const wav = await blobToWav16k(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      const text = await baiduRecognize(wav, cfg);
      onEnd && onEnd(text);
    } catch (e) {
      fail('error', `百度识别失败：${String(e.message || e).slice(0, 60)}`);
    }
  };

  // 静音检测：先有声（speaking），之后连续静音超时 → 结束（点屏幕也能提前结束）
  const tick = () => {
    analyser.getByteTimeDomainData(volBuf);
    let sum = 0;
    for (let i = 0; i < volBuf.length; i++) { const v = (volBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / volBuf.length);
    if (rms > 0.025) { speaking = true; silentSince = Date.now(); }
    else if (speaking && Date.now() - silentSince > 1500) { stop(); return; }
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { rec.stop(); } catch { /* 已停 */ }
  };
  active = stop;
  rec.start();
  raf = requestAnimationFrame(tick);
  return stop;
}

// 录音 blob（webm/opus 或 mp4）→ 16k 16bit 单声道 WAV（ArrayBuffer）
async function blobToWav16k(blob) {
  const ab = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  try {
    const srcBuf = await ac.decodeAudioData(ab);
    const TARGET = 16000;
    const outLen = Math.max(1, Math.ceil(srcBuf.duration * TARGET));
    const offline = new OfflineAudioContext(1, outLen, TARGET);
    const s = offline.createBufferSource();
    s.buffer = srcBuf;
    s.connect(offline.destination);
    s.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    return encodeWav(samples, TARGET);
  } finally {
    try { ac.close(); } catch { /* 忽略 */ }
  }
}

function encodeWav(samples, rate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

// 换/缓存 access_token（有效期约 30 天），再调短语音识别标准版
async function getToken(key, secret) {
  const cacheKey = `stall-baidu-token:${key}`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (c && c.exp > Date.now()) return c.token;
  } catch { /* 隐私模式无 localStorage，忽略缓存 */ }
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials` +
    `&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url, { method: 'POST' });
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || 'token 获取失败，检查 Key/Secret');
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ token: j.access_token, exp: Date.now() + (j.expires_in || 2592000) * 1000 }));
  } catch { /* 忽略缓存失败 */ }
  return j.access_token;
}

async function baiduRecognize(wav, cfg) {
  const token = await getToken(cfg.baiduKey, cfg.baiduSecret);
  const res = await fetch('https://vop.baidu.com/server_api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'wav', rate: 16000, channel: 1, cuid: 'stall-order',
      token, len: wav.byteLength, speech: toBase64(wav),
    }),
  });
  const j = await res.json();
  if (j.err_no === 0 && j.result) return (j.result || []).join('');
  throw new Error(j.err_msg || `识别失败（err_no ${j.err_no}）`);
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
