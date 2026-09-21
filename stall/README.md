# 摊主点单助手（stall）

夜市/烧烤摊的点单与桌台管理：**不碰支付**，只管记单、加单、语音播报、出餐叫号、清台。摊主端纯本地可用（IndexedDB），联机后顾客扫码点单实时播报。

- PRD：`docs/prd.md`（V1.0，2026-09-21）
- 实现笔记：`docs/notes.md`（MVP 范围 / 取舍 / 数据模型 / 联机架构）
- 代码：`src/`（React 自绘大按钮 UI；`sync.js` = PocketBase 适配器；`customer.jsx` = 顾客 H5）
- 自检：`npm run check`（无头 10 项：开台点单 → 出餐叫号 → 清台 → 统计 + 顾客页冒烟）

## 联机闭环（已实现）
1. 云端初始化（一次性）：
   ```bash
   PB_BASE=https://auth.tangzheheshui.cn PB_EMAIL=管理员 PB_PASS=xxx npm run pb-setup
   ```
2. 摊主端「设置 → 联机」注册/登录 → 自动建店铺 → **发布菜单**
3. 「桌号二维码」页逐张下载或整页打印，贴到桌边
4. 顾客扫码（`customer.html?s=店铺&t=桌号&b=服务器`）点单/加菜/呼叫 → 摊主端实时语音播报

断网语义：摊主手机没网照常记单（本地为准）；顾客连不上云端会明说，不会假成功。

拍板记录见根 `docs/ai/decisions.md`：顾客端先 H5 后小程序、实时走自有 PocketBase、MVP 摊主端先行。
