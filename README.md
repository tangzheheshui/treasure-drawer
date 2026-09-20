# 百宝抽屉（treasure-drawer）

个人小工具抽屉：常用工具收藏即取，进工具即全屏专注。首批 12 个内置工具（日常 / 效率 / 现场 三组），纯本地存储，无登录，Web 与手机同一应用、手机优先。

## 在哪看什么

| 想看 | 打开 |
|---|---|
| 做什么 / 不做什么 | `docs/requirements.html`（双击） |
| 能点的原型 | `docs/app.html`（双击） |
| 文档索引与进度 | `docs/README.md` |

## 目录结构（总-分）

总的 `docs/` 只管外壳（抽屉本身：首页/收藏/设置）与全局决策；**每个小工具一个目录，自带文档与代码，各自维护**。新工具 = 新建 `tools/<名>/`，照 `tools/erase-image/` 的样子，不往总 `docs/` 里堆单个工具的细节。

```
docs/               总文档：外壳需求/原型/AI 文档
tools/
  erase-image/      图片擦除（涂掉水印杂物，收费演示工具）
  ruler/            尺子（沿最长边，单边厘米刻度，真机自动定标不可调）
  scoreboard/       计分板（横屏翻页牌，上翻加分下翻减分）
  fake-call/        模拟来电（iPhone 风格，铃声震动）
  dice/             摇骰子（3D 骰盅，物理翻滚报点数）
```

每个工具目录自带 `README.md`（说明）、`docs/req.md`（需求）与 `src/`（代码），互不掺和；多数还带 `npm run check`（无头浏览器自检）。

## 开发流程

按 `/app` skill 六阶段推进：req → proto → ui → build → try → ship。当前进度见 `docs/README.md`，AI 内部文档在 `docs/ai/`。
