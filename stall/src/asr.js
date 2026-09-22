// 语音识别引擎适配器：点单页只跟这里的接口说话，换引擎不动 UI、不动解析。
//
// 两条路径，自动选：
// 1) 服务器代理（推荐，百度 key 配在 PocketBase 服务器，摊主零配置）：
//    摊主已联机（shop.pbBase + pbId）→ 录音/转码在前端，音频 POST 到
//    `${pbBase}/api/baidu-asr`，由服务器换 token 调百度返回文字。安卓/微信/App 通用。
// 2) 浏览器内置 ASR（兜底，未联机时）：webkitSpeechRecognition zh-CN，边说边上屏。
//
// 交互为「按住说话」：asrListen 一调用就开始收音，返回的 stopFn 在松手时调用 → 识别。
// 回调：
//   onVolume(0~1)  实时音量（仅服务器代理有，用来画波形让摊主知道在录）
//   onText(全文)   实时文字（仅浏览器 ASR 有 interim）
//   onEnd(最终文字)
//   onError(code, msg)

import { authToken } from './sync.js';

let active = null; // 进行中的会话；新会话开始时自动顶掉旧的

const online = (cfg) => !!(cfg && cfg.pbBase && cfg.pbId);
const webkit = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));

export function asrAvailable(cfg) { return online(cfg) || !!webkit(); }
export function asrLive(cfg) { return !online(cfg); }

export function asrListen(handlers, cfg) {
  if (active) { try { active(); } catch { /* 已停 */ } active = null; }
  return online(cfg) ? serverListen(handlers, cfg) : webkitListen(handlers);
}

// ── 浏览器内置 ASR（未联机兜底）：按住说，松手 stop → 出字 ──
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

// ── 服务器代理（百度一句话识别，key 在服务器）：按住录、松手停 → 转 16k WAV → POST 代理 ──
async function serverListen({ onVolume, onEnd, onError }, cfg) {
  let stream, audioCtx, rec, raf, stopped = false;

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
    if (!chunks.length) { onEnd && onEnd(''); return; } // 没录到声音
    try {
      const wav = await blobToWav16k(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      const text = await proxyRecognize(wav, cfg);
      onEnd && onEnd(text);
    } catch (e) {
      fail('error', `识别失败：${String(e.message || e).slice(0, 60)}`);
    }
  };

  // 实时音量（波形反馈）：每帧算 rms 抛给 UI
  const tick = () => {
    analyser.getByteTimeDomainData(volBuf);
    let sum = 0;
    for (let i = 0; i < volBuf.length; i++) { const v = (volBuf[i] - 128) / 128; sum += v * v; }
    onVolume && onVolume(Math.sqrt(sum / volBuf.length));
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

// 调 PocketBase 服务器上的 /api/baidu-asr 代理（带登录 token 校验身份）
async function proxyRecognize(wav, cfg) {
  const base = (cfg.pbBase || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/baidu-asr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authToken() },
    body: JSON.stringify({ format: 'wav', rate: 16000, len: wav.byteLength, speech: toBase64(wav) }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.text) return j.text;
  throw new Error(j.error || `识别失败（${res.status}）`);
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
    return encodeWav(rendered.getChannelData(0), TARGET);
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

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
