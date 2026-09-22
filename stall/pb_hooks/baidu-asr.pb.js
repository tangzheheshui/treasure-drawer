// PocketBase JS hooks：语音识别代理（百度 key 只在服务器，摊主端零配置）。
//
// 部署：把本文件放进 PocketBase 数据目录旁的 pb_hooks/ 目录（任意 .pb.js 文件名均可）。
// 凭证：环境变量 BAIDU_KEYS（JSON 数组，支持多个 key 轮询，见 .env.example）；
//       也兼容旧写法 BAIDU_KEY / BAIDU_SECRET 单 key。
// 摊主端（已登录）POST /api/baidu-asr  { format:'wav', rate:16000, len, speech:'<base64>' }
// 返回 { text }；失败 { error }。
// 鉴权：requireRecordAuth() 校验请求头 Authorization 是有效 users token，未登录一律 401。

// 读取凭证：优先 BAIDU_KEYS（数组，多 key 轮询），退回 BAIDU_KEY/BAIDU_SECRET
function loadKeys() {
  const raw = $os.getenv('BAIDU_KEYS');
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      const keys = (Array.isArray(arr) ? arr : []).filter((k) => k && k.key && k.secret);
      if (keys.length) return keys;
    } catch { /* 解析失败退回单 key */ }
  }
  const k = $os.getenv('BAIDU_KEY'), s = $os.getenv('BAIDU_SECRET');
  return (k && s) ? [{ key: k, secret: s }] : [];
}

// 每个 key 一份 token 缓存（约 30 天），失效自动重取
let _tokens = {}; // key 值 -> { token, exp }
let _rr = 0;      // 轮询指针

function getToken(k) {
  const c = _tokens[k.key];
  if (c && c.exp > Date.now()) return c.token;
  const url = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials' +
    '&client_id=' + encodeURIComponent(k.key) + '&client_secret=' + encodeURIComponent(k.secret);
  const res = $http.send({ url: url, method: 'POST' });
  const j = res.json || {};
  if (!j.access_token) throw new Error(j.error_description || j.error || 'token 获取失败');
  _tokens[k.key] = { token: j.access_token, exp: Date.now() + (j.expires_in || 2592000) * 1000 };
  return j.access_token;
}

function recognizeOnce(k, data) {
  const token = getToken(k);
  const res = $http.send({
    url: 'https://vop.baidu.com/server_api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: data.format || 'wav', rate: data.rate || 16000, channel: 1,
      cuid: 'stall-asr', token: token, len: data.len || 0, speech: data.speech,
    }),
  });
  const j = res.json || {};
  if (j.err_no === 0 && j.result) return (j.result || []).join('');
  throw new Error(j.err_msg || ('识别失败 err_no ' + j.err_no));
}

routerAdd('POST', '/api/baidu-asr', (e) => {
  const keys = loadKeys();
  if (!keys.length) return e.json(503, { error: '服务器未配置语音识别（缺 BAIDU_KEYS 或 BAIDU_KEY/BAIDU_SECRET）' });

  const data = new DynamicModel({ speech: '', format: 'wav', rate: 16000, len: 0 });
  e.bindBody(data);
  if (!(data.speech || '').trim()) return e.json(400, { error: '缺少音频' });

  // 多 key 轮询：某个 key 失败（额度/并发/失效）自动换下一个
  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[_rr % keys.length]; _rr++;
    try { return e.json(200, { text: recognizeOnce(k, data) }); }
    catch (err) { lastErr = err; }
  }
  return e.json(500, { error: String(lastErr || '识别失败').slice(0, 120) });
}, $apis.requireRecordAuth());
