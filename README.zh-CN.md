<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/troy-banner-dark.webp">
    <img src="assets/troy-banner-light.webp" width="100%" alt="Troy">
  </picture>
</p>

<h3 align="center">把你持有的积存金和市场金价放在同一块看板上。</h3>

<p align="center">
  <a href="https://github.com/Pixeldooooog/Troy/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pixeldooooog/Troy/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/core-Rust-B7410E?style=flat-square&logo=rust&logoColor=white">
  <img alt="macOS 14+ · Windows 11" src="https://img.shields.io/badge/macOS%2014%2B%20%C2%B7%20Windows%2011-124848?style=flat-square">
  <a href="https://github.com/Pixeldooooog/Troy/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pixeldooooog/Troy?style=flat-square&color=8A6A1F"></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b><br>
  <a href="#install">安装</a> ·
  <a href="#features">功能</a> ·
  <a href="#markets">数据源</a> ·
  <a href="#usage">使用</a> ·
  <a href="#development">本地开发</a> ·
  <a href="#architecture">架构</a> ·
  <a href="#faq">FAQ</a>
</p>

---

Troy 以金衡盎司（troy ounce）命名，常驻 macOS 菜单栏或 Windows 托盘，在本机采集 6 家银行的积存金报价、上金所 Au99.99 和国际现货金价。行情、历史和设置都保存在本地，不需要账号，也不上传任何数据。

<a id="install"></a>

## 📦 安装

从 [GitHub Releases](https://github.com/Pixeldooooog/Troy/releases/latest) 下载最新版本。

| 平台                               | 安装包                              | 说明                               |
| :--------------------------------- | :---------------------------------- | :--------------------------------- |
| macOS 14+（Apple Silicon / Intel） | `Troy-vX.Y.Z-macOS-universal.dmg`   | 打开 DMG，把 Troy 拖进「应用程序」 |
| Windows 11 x64                     | `Troy-vX.Y.Z-Windows-x64-setup.exe` | 运行安装程序                       |

> [!NOTE]
> Mac 包使用 ad hoc 签名，未经 Apple 公证，首次打开需要在「系统设置 → 隐私与安全性」中允许。Windows 安装包未做代码签名，SmartScreen 可能会提示。每个版本都附带 `SHA256SUMS.txt` 用于校验。

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
关闭窗口后仍在菜单栏或托盘里继续采集。可开机自启，macOS 和 Windows 都有系统通知，并支持签名校验的自动更新。

</td>
<td valign="top">

**🌗 你的习惯**<br>
支持中文和 English（菜单栏与托盘同步切换）、浅色和深色、红涨绿跌和绿涨红跌，侧栏可以收起，还有行情滚动条。

</td>
</tr>
</table>

<a id="markets"></a>

## 🏦 数据源

| 品种                   | 单位      | 报价                               | 轮询 |
| :--------------------- | :-------- | :--------------------------------- | ---: |
| 工商银行积存金         | 元/克     | 主动积存价，另显示赎回价           | 15 s |
| 招商银行黄金账户       | 元/克     | 客户买入价，另显示赎回价           | 15 s |
| 建设银行积存金         | 元/克     | 官网主动积存价与赎回价             | 30 s |
| 民生积存金（京东金融） | 元/克     | 接口参考价，无赎回价               | 30 s |
| 浙商积存金（京东金融） | 元/克     | 接口参考价，无赎回价               | 30 s |
| 大华银行黄金储蓄账户   | 新元/克   | 官网挂牌价：银行卖出价和银行买入价 | 60 s |
| 上海黄金交易所 Au99.99 | 元/克     | 官方延时行情                       | 30 s |
| 国际现货黄金 XAU/USD   | 美元/盎司 | 实时代理报价                       | 10 s |
| 美元兑人民币           | —         | 仅用于单位换算                     | 60 s |

报价状态分为几种：**有效**、**延时参考**、**上次报价**、**报价过期**和**暂不可用**。超过时效的报价不会触发提醒。界面优先显示银行给出的报价时间，银行没有给出时显示本机采集时间。

<a id="usage"></a>

## 🚀 使用

1. 打开 **设置 → 持仓**，勾选你持有的积存金。克数和成本价可以不填，填了就能看到盈亏。
2. 在 **总览** 查看持仓、走势对比、市场基准和买入价排行。点击任意卡片或行情可进入该品种的详情页。
3. 在详情页可以把品种 **固定到菜单栏或托盘**，也可以设置 **到价提醒**。

| 快捷键                     | 作用           |
| :------------------------- | :------------- |
| <kbd>⌘</kbd> <kbd>1</kbd>  | 回到总览       |
| <kbd>⌘</kbd> <kbd>\\</kbd> | 收起或展开侧栏 |
| <kbd>⌘</kbd> <kbd>,</kbd>  | 打开设置       |

Windows 上用 <kbd>Ctrl</kbd> 代替 <kbd>⌘</kbd>。

在 macOS 上，关闭窗口、按 <kbd>⌘</kbd> <kbd>Q</kbd> 或在 Dock 里选择退出，都只会隐藏窗口和 Dock 图标，采集继续进行。从菜单栏选择 **打开 Troy** 可以恢复窗口，选择 **退出 Troy** 才会结束进程。

<a id="development"></a>

## 🛠️ 本地开发

**需要的环境**：稳定版 Rust、Node.js 22.12+ 和 npm。macOS 还需要 Xcode Command Line Tools；Windows 还需要 MSVC C++ Build Tools、Windows SDK 和 WebView2 Runtime。

```sh
git clone https://github.com/Pixeldooooog/Troy.git
cd Troy
npm ci
npm run tauri dev      # 启动桌面应用，前端改动热更新
```

| 命令                              | 作用                                          |
| :-------------------------------- | :-------------------------------------------- |
| `npm run tauri dev`               | 开发模式运行桌面应用                          |
| `npm run dev:mock`                | 只在浏览器里跑界面，使用模拟行情，不需要 Rust |
| `npm run tauri build`             | 打包安装包                                    |
| `npm run lint` · `npm run format` | ESLint 检查 · Prettier 格式化                 |
| `npm run typecheck`               | TypeScript 类型检查                           |
| `npm test`                        | 前端单元测试（Vitest）                        |
| `npm run version:set -- 2.1.0`    | 一次改好所有清单和锁文件里的版本号            |

**数据目录**：数据库默认在应用数据目录下的 `v2/quotes.sqlite3`。在 Mac 上首次运行时，会从旧版数据库的一致快照和原应用偏好中导入数据。开发时可以设置 `TROY_DATA_DIR` 指向一个单独的测试目录，这样会跳过自动导入。

**测试**：在仓库根目录运行以下命令。

```sh
cargo test --locked -p troy-core                       # 离线验证报价口径、时间、聚合、换算、提醒与迁移
cargo test --locked --workspace                        # 需先 npm run build
cargo clippy --workspace --all-targets -- -D warnings
```

<a id="architecture"></a>

## 🧭 架构

```text
.
├── src/                    React + TypeScript 主窗口
│   ├── App.tsx               页面切换与快捷键
│   ├── pages/                总览 · 品种详情 · 设置
│   ├── components/           侧栏、行情滚动条、charts/（K 线、对比图、迷你图）
│   ├── hooks/                行情快照订阅、总览数据、更新检查
│   ├── lib/                  IPC 封装 (api.ts)、类型、品种、持仓计算、格式化
│   ├── i18n/                 zh / en 文案
│   ├── store/                本地偏好（语言、主题、持仓）
│   ├── styles/               设计令牌与分模块样式
│   └── mocks/                浏览器模式下的 Tauri 模拟
├── src-tauri/              Tauri 2 宿主：命令、多语言托盘、数据迁移、开机自启、自动更新
├── crates/troy-core/       Rust 核心，可脱离桌面独立运行
│   └── src/                  feeds · market · monitor · storage
├── scripts/                version.mjs（统一设置 / 检查版本号）
├── docs/                   架构文档
└── .github/workflows/      CI 与发布
```

采集、存储和提醒都由同一个 Rust 进程负责。窗口隐藏、重新打开或刷新，都不会打断行情任务。设计取舍见 [桌面架构](docs/architecture/desktop-v2.zh-CN.md)。

<a id="faq"></a>

## ❓ FAQ

<details>
<summary><b>「日涨跌」是怎么算的？</b></summary>

数据源公布了昨收价时（国际金价、美元兑人民币）就用官方昨收价；否则对比本机记录的北京时间上一日最后一笔报价。鼠标悬停在涨跌上会显示用的是哪一种。前一天电脑没运行、又没有官方昨收价时，会显示「—」。

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

<details>
<summary><b>从 2.0.x 升级，哪些会保留？</b></summary>

从 2.1 起应用标识改为 `com.pixeldooooog.troy`（原为 `local.goldmonitor.desktop`）。首次启动时会复制旧数据库，行情历史、到价提醒和固定品种都会保留，旧文件原样留着。2.0.x 窗口里设置的语言、主题和持仓存在网页存储中，需要重新设置一次。macOS 会重新请求通知权限。

</details>

## 🚢 构建与发布

代码提交至 main 或发起 PR 时，[CI](.github/workflows/ci.yml) 在 macOS 和 Windows 上检查版本号一致性，运行 ESLint、Prettier、Vitest、前端构建、rustfmt、Rust 测试与 Clippy，并编译桌面宿主。Dependabot 每周提交分组的依赖升级。

**自动更新的一次性设置**：把更新签名私钥添加为仓库 Secret `TAURI_SIGNING_PRIVATE_KEY`（有密码再加 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`），对应公钥已写在 `src-tauri/tauri.conf.json`。这是 Tauri 对更新包的签名，与 Apple / Windows 代码签名无关。请备份私钥：丢失后，已安装的应用将无法校验之后的更新。

发布前运行 `npm run version:set -- 2.1.0` 并合并到 main，然后在 [Release](https://github.com/Pixeldooooog/Troy/actions/workflows/release.yml) 选择 **Run workflow**，分支选 **main**，填写对应标签（例如 `v2.0.2`）。也可以直接推送版本标签触发发布。

流水线在两个平台重新运行测试，构建 macOS 通用 DMG 和 Windows x64 安装包，验证架构、DMG 挂载及「应用程序」拖放入口、Windows 静默安装及两个平台的应用启动。两端成功后生成 SHA-256 清单和签名的 `latest.json` 更新清单，发布 GitHub Release，并回读公开附件校验。手动运行旧标签会从该标签的提交重新构建并校验已有下载；新标签在打包成功后创建。重试同一标签会保留已公开的附件。Mac 包采用 ad hoc 签名，Windows 安装包未经代码签名。

## 📄 License

[MIT](LICENSE) © Pixeldooooog
