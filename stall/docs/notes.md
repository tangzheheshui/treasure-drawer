# 摊主点单助手 · 实现笔记

2026-09-21 开工。三个拍板（见总 decisions）：顾客端先 H5 后小程序；实时通道走自有 PocketBase；MVP 摊主端先行。

## MVP（本阶段）范围
- 摊主端纯本地先行：桌台卡片、点单、加单、退单、出餐标记、出餐叫号、清台、呼叫处理（模拟入口）、菜品/分类管理、店铺与语音设置、历史订单、今日统计。
- 语音播报：Web Speech API（zh-CN），不引第三方。
- 存储：idb-keyval，整库持久化（延续外壳「存储走适配器接口」决策，后续把 PocketBase 同步做成另一个适配器实现，UI 不动）。
- 登录后置：手机号验证码登录随联机阶段一起接（PocketBase），纯本地阶段无账号也能用全功能。
- 顾客端：本阶段不做真页，用「模拟顾客」入口演示新单/加单/呼叫三条实时路径。

## 简化与取舍（相对 PRD）
- UI 纯自绘大按钮（不引 antd-mobile）：摊主端要的是油烟里看得清的大字大按钮，自绘更贴，组件库留给外壳。
- 规格（辣度/份量）：MVP 只做每项备注文本，规格选择 V1.1。
- 桌号二维码：P1，联机阶段连同顾客 H5 一起做（码 = 顾客 H5 的 ?table=N 入口）。
- 手机号登录：后置（同上）。
- 播报文案：新单/加单/呼叫/叫号 P0 四条；「已清台」P2 未做。

## 数据模型
```
shop: { name, tableCount, voice, volume }
cats: [{ id, name }]
dishes: [{ id, catId, name, price, soldOut }]
orders: [{ id, tableNo, status: active|closed, items: [{ id, name, price, qty, note, served }], createdAt, closedAt }]
calls: [{ tableNo, at }]   // 未处理呼叫，进详情即消
```
桌态推导：无活跃单=空闲；活跃单全出餐=待清台；否则用餐中。
