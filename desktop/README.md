<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/troy-banner-dark.webp">
    <img src="../assets/troy-banner-light.webp" width="100%" alt="Troy">
  </picture>
</p>

<h3 align="center">把你持有的积存金和市场金价放在同一块看板上。</h3>

<p align="center">
  <a href="https://github.com/Pixeldooooog/Troy/actions/workflows/desktop-check.yml"><img alt="Desktop CI" src="https://github.com/Pixeldooooog/Troy/actions/workflows/desktop-check.yml/badge.svg"></a>
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/core-Rust-B7410E?style=flat-square&logo=rust&logoColor=white">
  <img alt="macOS 14+ · Windows 11" src="https://img.shields.io/badge/macOS%2014%2B%20%C2%B7%20Windows%2011-124848?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-2.0%20dev-8A6A1F?style=flat-square">
</p>

<p align="center">
  <a href="#features">功能</a> ·
  <a href="#markets">数据源</a> ·
  <a href="#usage">使用</a> ·
  <a href="#development">本地开发</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#faq">FAQ</a>
</p>

---

**Troy 2** 是 [Troy](../README.md) 的跨平台重写版，常驻 macOS 菜单栏或 Windows 托盘，在本机采集 6 家银行的积存金报价、上金所 Au99.99 和国际现货金价。行情、历史和设置都保存在本地，不需要账号，也不上传任何数据。

> [!NOTE]
> Troy 2 仍在开发中，正式版发布前请从源码构建。已发布的 Swift 版本见[仓库首页](../README.md)。

<a id="features"></a>

## ✨ 功能

<table>
<tr>
<td width="50%" valign="top">

**📊 总览看板**<br>
持仓卡片、30 分钟走势迷你图、日涨跌，以及较上金所的溢价，一屏看完。

</td>
<td width="50%" valign="top">

**💰 持仓盈亏**<br>
填写克数和成本价后，按赎回价自动计算参考市值、浮动盈亏和今日盈亏。

</td>
</tr>
<tr>
<td valign="top">

**📈 走势对比**<br>
把你持有的积存金和上金所、国际金价放在一张图上，统一换算成相对首笔的涨跌幅，可逐条开关。

</td>
<td valign="top">

**🏦 买入价排行**<br>
可比时间窗内的银行买入价从低到高排列，标出最低一家和每家的价差。

</td>
</tr>
<tr>
<td valign="top">

**🔔 到价提醒**<br>
每个品种都能单独设置目标价。价格跌到目标价时提醒一次，回到目标价以上后重新生效。

</td>
<td valign="top">

**🕯️ 专业图表**<br>
支持分时、分钟 K、日 K、周 K、月 K，可切换原始报价、人民币克价、首笔 = 100 三种口径。

</td>
</tr>
<tr>
<td valign="top">

**🖥️ 常驻后台**<br>
关闭窗口后仍在菜单栏或托盘里继续采集，固定显示的品种价格一直可见。

</td>
<td valign="top">

**🌗 你的习惯**<br>
支持中文和 English、浅色和深色、红涨绿跌和绿涨红跌，侧栏可以收起，还有行情滚动条。

</td>
</tr>
</table>

<a id="markets"></a>

## 🏦 数据源

| 品种 | 单位 | 报价 | 轮询 |
| :-- | :-- | :-- | --: |
| 工商银行积存金 | 元/克 | 主动积存价，另显示赎回价 | 15 s |
| 招商银行黄金账户 | 元/克 | 客户买入价，另显示赎回价 | 15 s |
| 建设银行积存金 | 元/克 | 官网主动积存价与赎回价 | 30 s |
| 民生积存金（京东金融） | 元/克 | 接口参考价，无赎回价 | 30 s |
| 浙商积存金（京东金融） | 元/克 | 接口参考价，无赎回价 | 30 s |
| 大华银行黄金储蓄账户 | 新元/克 | 官网挂牌价：银行卖出价和银行买入价 | 60 s |
| 上海黄金交易所 Au99.99 | 元/克 | 官方延时行情 | 30 s |
| 国际现货黄金 XAU/USD | 美元/盎司 | 实时代理报价 | 10 s |
| 美元兑人民币 | — | 仅用于单位换算 | 60 s |

报价状态分为几种：**有效**、**延时参考**、**上次报价**、**报价过期**和**暂不可用**。超过时效的报价不会触发提醒。界面优先显示银行给出的报价时间，银行没有给出时显示本机采集时间。

<a id="usage"></a>

## 🚀 使用

1. 打开 **设置 → 持仓**，勾选你持有的积存金。克数和成本价可以不填，填了就能看到盈亏。
2. 在 **总览** 查看持仓、走势对比、市场基准和买入价排行。点击任意卡片或行情可进入该品种的详情页。
3. 在详情页可以把品种 **固定到菜单栏或托盘**，也可以设置 **到价提醒**。

| 快捷键 | 作用 |
| :-- | :-- |
| <kbd>⌘</kbd> <kbd>1</kbd> | 回到总览 |
| <kbd>⌘</kbd> <kbd>\\</kbd> | 收起或展开侧栏 |
| <kbd>⌘</kbd> <kbd>,</kbd> | 打开设置 |

Windows 上用 <kbd>Ctrl</kbd> 代替 <kbd>⌘</kbd>。

在 macOS 上，关闭窗口、按 <kbd>⌘</kbd> <kbd>Q</kbd> 或在 Dock 里选择退出，都只会隐藏窗口和 Dock 图标，采集继续进行。从菜单栏选择 **打开 Troy** 可以恢复窗口，选择 **退出 Troy** 才会结束进程。

<a id="development"></a>

## 🛠️ 本地开发

**需要的环境**：稳定版 Rust、Node.js 22.12+ 和 npm。macOS 还需要 Xcode Command Line Tools；Windows 还需要 MSVC C++ Build Tools、Windows SDK 和 WebView2 Runtime。

```sh
git clone https://github.com/Pixeldooooog/Troy.git
cd Troy/desktop
npm ci
npm run build
cargo run --locked -p troy-desktop --features custom-protocol
```

**数据目录**：数据库默认在应用数据目录下的 `v2/quotes.sqlite3`。在 Mac 上首次运行时，会从旧版数据库的一致快照和原应用偏好中导入数据。开发时可以设置 `TROY_DATA_DIR` 指向一个单独的测试目录，这样会跳过自动导入。

**测试**：在仓库根目录运行以下命令。

```sh
cargo test --locked -p troy-core                       # 离线验证报价口径、时间、聚合、换算、提醒与迁移
cargo test --locked --workspace                        # 需先构建前端
cargo clippy --workspace --all-targets -- -D warnings
```

<a id="architecture"></a>

## 🧭 架构

```text
crates/troy-core/        Rust 核心，可脱离桌面独立运行
  feeds.rs                 数据源请求、解码、来源与降级
  market.rs                品种、时效、单位换算与 OHLC 聚合
  monitor.rs               采集调度、阈值与快照
  storage.rs               SQLite、偏好与迁移
desktop/
  src-tauri/               Tauri 2 宿主：窗口、菜单栏/托盘、IPC 命令
  src/                     React 主窗口
    Overview.tsx             总览看板
    Detail.tsx · Chart.tsx   品种详情与 K 线
    Shell.tsx                侧栏与行情滚动条
    SettingsPage.tsx         设置
    i18n.ts · store.ts       多语言与本地偏好
```

采集、存储和提醒都由同一个 Rust 进程负责。窗口隐藏、重新打开或刷新，都不会打断行情任务。设计取舍见 [Troy 2 桌面架构提案](../docs/architecture/desktop-v2.zh-CN.md)。

<a id="faq"></a>

## ❓ FAQ

<details>
<summary><b>「日涨跌」是怎么算的？</b></summary>

它对比的是本机记录的上一日最后一笔报价，不是银行公布的昨收价。如果前一天电脑没有运行，就没有对比基准，会显示「—」。

</details>

<details>
<summary><b>持仓市值为什么用赎回价？</b></summary>

赎回价才是你现在卖出能拿到的价格，所以用它算市值更接近实际。没有赎回价的品种（比如京东渠道的两款）会改用买入价。

</details>

<details>
<summary><b>我的持仓数据存在哪里？</b></summary>

只存在本机，具体是窗口的本地存储和 `quotes.sqlite3`。Troy 不联网上传任何个人数据。

</details>

<details>
<summary><b>为什么有些时段图表是空白的？</b></summary>

图表只画本机实际采集到的报价。电脑休眠或数据源不可用的时段会留白，不会做插值补线。

</details>

## 📄 License

[MIT](../LICENSE) © Pixeldooooog

## GitHub Actions 构建与发布

桌面代码提交至 main 或发起 PR 时，GitHub 托管的 macOS 和 Windows runner 会构建前端、测试 Rust workspace、运行 Clippy 并编译桌面宿主。

发布前先将版本号更新到 main。在 [Troy desktop release](https://github.com/Pixeldooooog/Troy/actions/workflows/desktop-release.yml) 选择 **Run workflow**，分支选 **main**，填写对应标签（例如 `v2.0.2`）。也可以直接推送版本标签触发发布。

流水线在两个平台重新运行测试，构建 macOS 通用 ZIP 和 Windows x64 安装包，验证架构、Mac 应用启动和 Windows 静默安装。两端成功后生成 SHA-256 清单，发布 GitHub Release，并回读公开附件校验。手动运行旧标签会从该标签的提交重新构建并校验已有下载；新标签在打包成功后创建。重试同一标签会保留已公开的附件。Mac 包采用 ad hoc 签名，Windows 安装包未经代码签名。
