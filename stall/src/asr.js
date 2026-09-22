// 语音识别引擎适配器：点单页只跟这里的接口说话，换引擎不动 UI、不动解析。
// 现役实现：浏览器内置 ASR（webkitSpeechRecognition zh-CN，iPhone Safari 可用；
// 安卓 Chrome 走谷歌服务国内可能连不上，微信内置网页不支持）。
// 将来做套壳 App / 接商用中文 ASR（讯飞/百度 HTTP 接口：MediaRecorder 录音
// → 传接口 → 回文字，网页与 App 一套代码），保持 asrListen 出入参换掉实现即可。
//
// 接口：
//   asrAvailable() → bool                     当前环境有没有引擎可用（没有就藏麦克风）
//   asrListen({ onText, onEnd, onError }) → stopFn
//     onText(全文)      边说边上屏（中途+已定稿合并后的文字）
//     onEnd(最终文字)   说完停顿自动结束（空串=没听清）
//     onError(code)     'not-allowed'=没给麦克风权限 等
// 返回的 stopFn：点屏幕提前结束（提前结束也走 onEnd，带已听到的文字）。

let active = null; // 进行中的会话；新会话开始时自动顶掉旧的

export function asrAvailable() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function asrListen({ onText, onEnd, onError }) {
  if (active) { try { active.raw.stop(); } catch { /* 已停 */ } active = null; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError && onError('unsupported'); return () => {}; }

  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = true; // 边说边上屏
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
  rec.onerror = (e) => { onError && onError(e.error || 'error'); };
  rec.onend = () => {
    active = null;
    onEnd && onEnd(fin.trim());
  };
  const stop = () => { try { rec.stop(); } catch { /* 已停 */ } };
  active = { raw: rec, stop };
  try { rec.start(); } catch { /* 重复 start 忽略 */ }
  return stop;
}
