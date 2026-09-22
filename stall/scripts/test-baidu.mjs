// 百度语音识别连通性自测（服务器管理员用）：验证 API Key / Secret 是否正确、接口是否通。
// 用法：BAIDU_KEY=xxx BAIDU_SECRET=yyy node scripts/test-baidu.mjs
// 只测 token 换取这步（这步就能定位「key 填错 / 未开通服务」），不依赖浏览器、不录音。
const key = process.env.BAIDU_KEY;
const secret = process.env.BAIDU_SECRET;

if (!key || !secret) {
  console.log('用法：BAIDU_KEY=xxx BAIDU_SECRET=yyy node scripts/test-baidu.mjs');
  console.log('（拿到百度 Key/Secret 后跑一次，验证 key 对不对、接口通不通）');
  process.exit(0);
}

const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials` +
  `&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`;

try {
  const res = await fetch(url, { method: 'POST' });
  const j = await res.json();
  if (j.access_token) {
    console.log('✓ token 获取成功，Key/Secret 有效');
    console.log('  token 前 12 位：' + j.access_token.slice(0, 12) + '…');
    console.log('  有效期：约 ' + Math.round((j.expires_in || 2592000) / 86400) + ' 天');
    console.log('  → 把这两个值设为 PocketBase 环境变量（BAIDU_KEY/BAIDU_SECRET），部署 pb_hooks/baidu-asr.pb.js 即可');
  } else {
    console.log('✗ token 获取失败：' + (j.error_description || j.error || JSON.stringify(j)));
    console.log('  常见原因：Key 或 Secret 填错 / 未开通「短语音识别」服务 / 未实名认证');
    process.exit(1);
  }
} catch (e) {
  console.log('✗ 网络请求失败：' + e.message);
  console.log('  检查网络，或本机代理/防火墙是否拦了 aip.baidubce.com');
  process.exit(1);
}
