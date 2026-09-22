// PocketBase JS hooks：语音识别代理（百度 key 只在服务器，摊主端零配置）。
//
// 部署：把本文件放进 PocketBase 数据目录旁的 pb_hooks/ 目录。
// 凭证：环境变量 BAIDU_KEYS（JSON 数组，多 key 轮询）；兼容 BAIDU_KEY/BAIDU_SECRET 单 key。
// 摊主端（已登录）POST /api/baidu-asr  { format:'wav', rate:16000, len, speech:'<base64>' }
// 返回 { text }；失败 { error }。
// 鉴权：requireAuth() 校验 Authorization 是有效 record token，未登录 401。
//
// PocketBase 0.40 注意：handler 回调访问不到本文件的顶层函数/变量，
// 所以逻辑全部内联在 handler 里，token 缓存/轮询指针挂 globalThis 跨请求持久。

routerAdd('POST', '/api/baidu-asr', (e) => {
  try {
    // ── 读取凭证：优先 BAIDU_KEYS（多 key），退回 BAIDU_KEY/BAIDU_SECRET ──
    var keys = [];
    var raw = $os.getenv('BAIDU_KEYS');
    if (raw) {
      try {
        var arr = JSON.parse(raw);
        keys = (Array.isArray(arr) ? arr : []).filter(function (k) { return k && k.key && k.secret; });
      } catch (err) { /* 解析失败退回单 key */ }
    }
    if (!keys.length) {
      var k1 = $os.getenv('BAIDU_KEY'), s1 = $os.getenv('BAIDU_SECRET');
      if (k1 && s1) keys = [{ key: k1, secret: s1 }];
    }
    if (!keys.length) return e.json(503, { error: '服务器未配置语音识别（缺 BAIDU_KEYS 或 BAIDU_KEY/BAIDU_SECRET）' });

    // ── 读 body ──
    var data = new DynamicModel({ speech: '', format: 'wav', rate: 16000, len: 0 });
    e.bindBody(data);
    if (!(data.speech || '').trim()) return e.json(400, { error: '缺少音频' });

    // ── 跨请求状态（token 缓存 + 轮询指针）──
    var g = globalThis.__stallAsr || (globalThis.__stallAsr = { tokens: {}, rr: 0 });

    // ── 多 key 轮询：某 key 失败（额度/并发/失效）自动换下一个 ──
    var lastErr;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[g.rr % keys.length]; g.rr++;
      try {
        // 换/缓存 access_token（约 30 天）
        var tc = g.tokens[k.key];
        if (!tc || tc.exp <= Date.now()) {
          var turl = 'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials' +
            '&client_id=' + encodeURIComponent(k.key) + '&client_secret=' + encodeURIComponent(k.secret);
          var tr = $http.send({ url: turl, method: 'POST' });
          var tj = tr.json || {};
          if (!tj.access_token) throw new Error(tj.error_description || tj.error || 'token 获取失败');
          tc = { token: tj.access_token, exp: Date.now() + (tj.expires_in || 2592000) * 1000 };
          g.tokens[k.key] = tc;
        }
        // 调百度短语音识别标准版
        var res = $http.send({
          url: 'https://vop.baidu.com/server_api',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: data.format || 'wav', rate: data.rate || 16000, channel: 1,
            cuid: 'stall-asr', token: tc.token, len: data.len || 0, speech: data.speech,
          }),
        });
        var j = res.json || {};
        if (j.err_no === 0 && j.result) return e.json(200, { text: (j.result || []).join('') });
        throw new Error(j.err_msg || ('识别失败 err_no ' + j.err_no));
      } catch (err) { lastErr = err; }
    }
    return e.json(500, { error: String(lastErr || '识别失败').slice(0, 200) });
  } catch (err) {
    return e.json(500, { error: '异常: ' + String((err && err.message) || err).slice(0, 200) });
  }
}, $apis.requireAuth());
