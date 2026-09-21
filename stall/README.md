# 摊主点单助手（stall）

夜市/烧烤摊的点单与桌台管理：**不碰支付**，只管记单、加单、语音播报、出餐叫号、清台。摊主端纯本地可用（IndexedDB），顾客 H5 与 PocketBase 实时同步在路线图上。

- PRD：`docs/prd.md`（V1.0，2026-09-21）
- 实现笔记：`docs/notes.md`（MVP 范围 / 取舍 / 数据模型）
- 代码：`src/`（React + 自绘大按钮 UI，Web Speech API 播报）
- 自检：`npm run check`（无头：开台点单 → 出餐叫号 → 清台 → 统计归档）
- dev：`npm run dev`（端口 5188）；预览台 `tools/preview.html` 有入口

拍板记录见根 `docs/ai/decisions.md`：顾客端先 H5 后小程序、实时走自有 PocketBase、MVP 摊主端先行。
