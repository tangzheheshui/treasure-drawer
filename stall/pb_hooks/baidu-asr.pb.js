// PocketBase JS hooks：语音识别代理（百度 key 只在服务器，摊主端零配置）。
//
// 部署：把本文件放进 PocketBase 数据目录旁的 pb_hooks/ 目录（任意 .pb.js 文件名均可）。
// 环境变量：启动 PocketBase 前设置 BAIDU_KEY 与 BAIDU_SECRET（百度智能云 · 短语音识别应用）。
// 摊主端（已登录）POST /api/baidu-asr  { format:'wav', rate:16000, len, speech:'<base64>' }
// 返回 { text }；失败 { error }。
// 鉴权：requireRecordAuth() 校验请求头 Authorization 是有效 users token，未登录一律 401。

let _token = null, _tokenExp = 0;

function getToken(key, secret) {
  if (_token && _tokenExp > Date.now()) return _token;
  const url = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials' +
    '&client_id=' + encodeURIComponent(key) + '&client_secret=' + encodeURIComponent(secret);
  const res = $http.send({ url: url, method: 'POST' });
  const j = res.json || {};
  if (!j.access_token) throw new Error(j.error_description || j.error || 'token 获取失败');
  _token = j.access_token;
  _tokenExp = Date.now() + (j.expires_in || 2592000) * 1000;
  return _token;
}

routerAdd('POST', '/api/baidu-asr', (e) => {
  const key = $os.getenv('BAIDU_KEY');
  const secret = $os.getenv('BAIDU_SECRET');
  if (!key || !secret) return e.json(503, { error: '服务器未配置语音识别（缺 BAIDU_KEY/BAIDU_SECRET）' });

  const data = new DynamicModel({ speech: '', format: 'wav', rate: 16000, len: 0 });
  e.bindBody(data);
  if (!(data.speech || '').trim()) return e.json(400, { error: '缺少音频' });

  try {
    const token = getToken(key, secret);
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
    if (j.err_no === 0 && j.result) return e.json(200, { text: (j.result || []).join('') });
    return e.json(500, { error: j.err_msg || ('识别失败 err_no ' + j.err_no) });
  } catch (err) {
    return e.json(500, { error: String(err).slice(0, 120) });
  }
}, $apis.requireRecordAuth());
