<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/troy-banner-dark.webp">
    <img src="assets/troy-banner-light.webp" width="100%" alt="Troy 垂耳狗与称量金锭的天平">
  </picture>
</p>

<h3 align="center">在 Mac 菜单栏看四个品种的金价，跌到你设的价格就提醒。</h3>

<p align="center">
  <a href="https://github.com/Pixeldooooog/Troy/actions/workflows/macos.yml"><img alt="macOS CI" src="https://github.com/Pixeldooooog/Troy/actions/workflows/macos.yml/badge.svg"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-124848?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b><br>
  <a href="#start">快速开始</a> · <a href="#markets">行情来源</a> · <a href="#alerts">到价提醒</a> · <a href="#development">开发</a>
</p>

Troy 取名自黄金的计量单位 troy ounce（金衡盎司），是 Pixeldooooog 的原生 macOS 黄金行情工具。在菜单栏固定一个报价，打开主窗口就能比较四个品种近 30 分钟的走势。应用界面使用简体中文。

<a id="start"></a>

## 快速开始

在运行 macOS 14 或更新版本的 Mac 上，从 [GitHub Releases](https://github.com/Pixeldooooog/Troy/releases/latest) 下载通用 DMG，打开后把 Troy 拖到「应用程序」。安装包采用临时签名，尚未经过 Apple 公证。

点击菜单栏价格即可切换品种，也可在主窗口选择 **放入菜单栏**。关闭窗口后继续采集，退出应用或让 Mac 进入睡眠时暂停。

<a id="markets"></a>

## 行情来源与图表

| 品种 | 单位 | 报价来源 | 采集间隔 |
| --- | --- | --- | --- |
| 工行积存金 · JC001 | 元/克 | 工商银行主动积存价，另列赎回价 | 15 秒 |
| 招行黄金账户 | 元/克 | 招商银行客户买入价，另列赎回价 | 15 秒 |
| 上海黄金交易所 · Au99.99 | 元/克 | 上金所官方延时行情 | 30 秒 |
| 国际现货黄金 · XAU/USD | 美元/金衡盎司 | Gold API，备用为新浪财经 | 10 秒 |

采集间隔表示 Troy 查询数据源的频率。四个品种可按人民币克价或相对涨跌幅同屏对比。在原始价格视图中选择品种和 1 分钟或 5 分钟周期，即可查看本机采样形成的开、高、低、收。红涨绿跌，开收相同显示横杠，没有采样的时段留空。

<a id="alerts"></a>

## 到价提醒

按各品种自己的报价单位设置目标价。四个提醒独立运行，切换菜单栏品种后仍然有效。有效报价首次小于或等于目标价时触发，回升至目标价以上后重新启用。实际提醒时间取决于行情发布、采集间隔和 macOS 通知设置。通知不可用时，Troy 通过声音和 Dock 提示，菜单里也能看到最近一次触发记录。历史行情与阈值都保存在本机。

<a id="development"></a>

## 参与开发

安装 Xcode 后，可以直接打开 `Package.swift`，也可以用终端构建。

```sh
git clone https://github.com/Pixeldooooog/Troy.git
cd Troy
./scripts/build-mac-app.zsh
open dist-macos/Troy.app
```

用 Xcode 打开 `Package.swift` 可浏览应用与测试。运行 `swift test` 验证 K 线聚合与报价时效逻辑。构建脚本生成经本地临时签名的通用应用，同时支持 Apple Silicon 和 Intel。GitHub Actions 会运行测试、打包应用，并校验签名和二进制架构。

| 源码入口 | 职责 |
| --- | --- |
| [MarketFeeds](Sources/Troy/Markets/MarketFeeds.swift) 和 [MarketModels](Sources/Troy/Markets/MarketModels.swift) | 获取报价，判断行情时效 |
| [GoldMonitor](Sources/Troy/App/GoldMonitor.swift) 和 [QuoteStore](Sources/Troy/Persistence/QuoteStore.swift) | 调度采样，使用 SQLite 保存数据 |
| [MenuMonitor](Sources/Troy/MenuBar/MenuMonitor.swift) | 菜单栏与到价通知 |
| [Views](Sources/Troy/Views/DashboardView.swift) 和 [TapeChart](Sources/Troy/Views/TapeChart.swift) | SwiftUI 主窗口与 Apple Charts 采样 K 线 |

Troy 2 的双平台测试、DMG 和 Windows 安装包发布由 [GitHub Actions](https://github.com/Pixeldooooog/Troy/actions/workflows/desktop-release.yml) 执行，具体步骤见[桌面发布说明](desktop/README.md#github-actions-构建与发布)。

## 许可证

[MIT](LICENSE) · Pixeldooooog
