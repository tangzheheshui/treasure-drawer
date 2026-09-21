// 语音播报：系统 TTS（zh-CN），零依赖。嘈杂环境兜底 = 震动 + 卡片闪烁。
let on = true;
let vol = 1;

export function syncVoice(shop) {
  on = !!shop.voice;
  vol = shop.volume ?? 1;
}

export function say(text) {
  if (!on || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel(); // 播报永远播最新一条，高峰期不排队
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    u.volume = vol;
    speechSynthesis.speak(u);
  } catch { /* 无声环境 */ }
  navigator.vibrate && navigator.vibrate(120);
}
