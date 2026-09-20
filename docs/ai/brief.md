# 需求要点（Brief）· 百宝抽屉

> 一句话定位：个人小工具抽屉——常用工具收藏即取，进工具即全屏专注
> 目标用户：开发者本人 + 日常/现场场景要随手用小工具的人
> 组件库：**antd-mobile 5.43.0**（React 18.3）
> 交付形态：**纯 Web**（响应式，手机优先 390 宽基准）
> 路由模式：**HashRouter**
> 账号：**可选登录**（只为收费工具解锁；收藏数据仍只存本机，登录通道工程阶段接自有 PocketBase auth.tangzheheshui.cn）
> 数据存哪：**IndexedDB 本地**（idb-keyval 适配器接口锁死，无备份导入导出）

配套选型：Vite 6 + TypeScript + zustand（业务/瞬态双 store）+ idb-keyval；二维码编码 build 阶段引 `qrcode` 库；图标用 antd-mobile-icons。React 锁 18.3（tutor-desk 同版本同机实测稳定）。

## 页面/模块清单（14 页）

| 页面 | 职责 |
|---|---|
| 抽屉首页 | 收藏宫格 + 设置侧滑面板（个人资料 / 意见反馈 / 购买支持 / 关于） |
| 工具列表 | 12 个内置工具一行式列表，日常/效率/现场三组分段与搜索 |
| 二维码生成 | 文本/链接转二维码，尺寸选择 |
| 密码生成 | 长度 + 字符类型生成强密码，强度提示，复制 |
| 单位换算 | 长度/重量/温度三段，双单位即时换算 |
| 颜色转换 | HEX/RGB/HSL 互转，色块预览，复制 |
| 擦图 | 画笔涂抹抹除图片局部（轻擦除先行） |
| 字数统计 | 字符/汉字/词/段落/行实时统计 |
| 文本对比 | 左右两栏行级差异高亮 |
| 倒计时番茄钟 | 25/5/10 预设 + 自定义分钟，开始/暂停/重置 |
| 随机抽签 | 范围随机数与名单抽 N 去重 |
| 记分牌 | 红蓝两队全屏大数字计分 |
| 模拟来电 | 全屏仿来电界面，预约响铃 |
| 尺子 | 屏幕刻度尺，一次性校准 |

## 组件矩阵结论（三库真页实测，2026-09-20）

| 组件 | antd-mobile 5.43.0 | Vant 4.10.2 | NutUI-React 3.0.11-patch | 本项目 |
|---|---|---|---|---|
| 底部Tab | 有现成（TabBar） | 有现成（Tabbar） | 有现成（Tabbar） | 用 TabBar |
| 下拉刷新 | 有现成（PullToRefresh） | 有现成（PullRefresh） | 有现成（PullToRefresh） | 首页收起态横滚用，可不用 |
| 左滑操作 | 有现成（SwipeAction） | 有现成（SwipeCell） | 有现成（Swipe） | 整理抽屉用 |
| ActionSheet | 有现成（函数式+组件式） | 有现成（**仅组件式**） | 有现成（仅组件式） | 设置菜单用 |
| Picker/级联 | 有现成（Picker/CascadePicker） | 有现成（Picker/Area） | 有现成（Picker/Cascader） | 单位换算用 |
| Toast | 有现成 | 有现成 | 有现成 | 复制反馈用 |
| Modal/Confirm | 有现成（Dialog） | 有现成 | 有现成 | 移除确认用 |
| 表单校验 | 有现成（Form） | 有现成 | 有现成 | 各工具输入用 |
| 日期时间选择 | 有现成（DatePicker） | 有现成 | 有现成 | 不需要（无日期工具） |
| 虚拟长列表 | 没有（配 react-window） | 没有 | 没有 | 不需要（列表短） |
| 骨架屏 | 有现成（Skeleton） | 有现成 | 有现成 | 首开加载用 |
| 空态 | 有现成（ErrorBlock/Empty） | 有现成（Empty） | 有现成（Empty） | 用 ErrorBlock |
| 无限滚动 | 有现成（InfiniteScroll） | 有现成（List） | 有现成（InfiniteLoading） | 不需要 |
| 抽屉 | 有现成（Popup 四向） | 有现成（Popup） | 有现成（Popup） | 弹层全用 Popup 系 |
| 分段控件 | 有现成（Segmented） | **需手搓** | 有现成（Segmented） | 分组切换用 |
| 徽标/角标 | 有现成（Badge） | 有现成 | 有现成 | 抽屉角标用 |
| 图表 | 没有 | 没有 | 没有 | MVP 无图表 |

**判定**：关键五项（底部Tab/下拉刷新/左滑/ActionSheet/Picker）三候选均 ≥4 有现成，无一触发否决线（≥2 手搓/没有）；再按栈与体积定夺 → **antd-mobile**。

### 实测记录（同一验证页 ×3 库，真构建 + 无头 Edge 390×844 打开）

| 项 | antd-mobile | Vant | NutUI-React |
|---|---|---|---|
| 构建 CSS | **32.4 kB**（gzip 6.5，零配置摇树） | 199 kB 全量（gzip 53，按需需另配插件） | 227 kB 全量（gzip 32） |
| 构建 JS（含框架） | 462 kB（gzip 155，含 React） | 141 kB（gzip 53，含 Vue） | 326 kB（gzip 109） |
| 浏览器渲染 | 表单/骨架/徽标/TabBar/左滑 ✓，点按钮真弹 Dialog ✓ | 同左 ✓ | 同左 ✓（无报错） |
| API 漂移摩擦 | 组件名 PullToRefresh/SwipeAction（非 PullRefresh/SwipeCell） | ActionSheet 无函数式 | PullToRefresh/InfiniteLoading 拼写漂移，样式路径要翻包 |
| 发布健康度 | latest = 5.43.0 稳定 | latest = 4.10.2 稳定 | latest 指向 **4.0 beta**，稳定版停 3.0.11-patch |

微信内置浏览器实测：**待确认**（需真机，try 阶段验；三库均国内团队维护，境内可用性风险低）。

## 明确不做

- 独立登录页与找回密码流（登录做成弹层，只为收费工具解锁）
- 云同步与冲突策略（纯本地，扩展池）
- 无限滚动/虚拟长列表/图表（列表短且无图表需求）
- Capacitor 套壳（纯 Web 先行）
- 自定义网址条目（仅内置工具）

## 待确认问题

- 擦图工具擦除算法档位：轻擦除（模糊/涂抹）先行是否够用，内容感知填充要不要本地跑模型 → build ① 前定
- 部署目标：GitHub Pages 或自有服务器 → ship 阶段定（HashRouter 已兼容静态托管）
