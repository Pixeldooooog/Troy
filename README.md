<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/troy-banner-dark.webp">
    <img src="assets/troy-banner-light.webp" width="100%" alt="Troy, a floppy-eared dog beside a gold assay balance">
  </picture>
</p>

<h3 align="center">Three gold markets in your Mac menu bar. Set a price and Troy will listen.</h3>

<p align="center">
  <a href="https://github.com/Pixeldooooog/Troy/actions/workflows/macos.yml"><img alt="macOS CI" src="https://github.com/Pixeldooooog/Troy/actions/workflows/macos.yml/badge.svg"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-124848?style=flat-square">
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a><br>
  <a href="#start">Quick start</a> · <a href="#markets">Markets</a> · <a href="#alerts">Alerts</a> · <a href="#development">Development</a>
</p>

Named for the troy ounce, Troy is a native macOS gold monitor from Pixeldooooog. Pin one price to the menu bar and open the dashboard to compare the last 30 minutes across markets. The app interface is in Simplified Chinese.

<a id="start"></a>

## Quick start

On macOS 14 or later, download the universal DMG from [GitHub Releases](https://github.com/Pixeldooooog/Troy/releases/latest), open it and drag Troy into Applications. The app uses an ad hoc signature and has not been notarized by Apple.

Click the price in the menu bar to switch markets, or select **放入菜单栏** in the dashboard. Closing the window keeps the monitor running. Quitting Troy or putting the Mac to sleep pauses sampling.

<a id="markets"></a>

## Markets and charts

| Market | Unit | Quote | Poll interval |
| --- | --- | --- | --- |
| ICBC gold accumulation · JC001 | CNY/g | ICBC purchase price, with redemption shown separately | 15 s |
| Shanghai Gold Exchange · Au99.99 | CNY/g | Official delayed quote | 30 s |
| International spot gold · XAU/USD | USD/troy oz | Gold API, with Sina Finance as fallback | 10 s |

Poll intervals describe how often Troy checks each source. Compare the quotes in yuan per gram or as relative changes. In the original-price view, select a market and a 1- or 5-minute candle. Each candle shows the open, high, low and close of quotes your Mac observed. Red indicates a rise, green a fall, and a dash an unchanged close. Intervals without samples stay blank.

<a id="alerts"></a>

## Price alerts

Set a target in the market’s own unit. Each of the three alerts runs independently of the menu bar selection. A current quote at or below the target triggers once. A quote above it arms the alert again. Delivery depends on the source, sampling interval and macOS notification settings. Troy uses sound and a Dock alert when notifications are unavailable. The latest trigger is visible in the menu. History and thresholds are stored locally.

<a id="development"></a>

## Development

With Xcode installed, open `Package.swift` or build from Terminal.

```sh
git clone https://github.com/Pixeldooooog/Troy.git
cd Troy
./scripts/build-mac-app.zsh
open dist-macos/Troy.app
```

Open `Package.swift` in Xcode to browse the app and tests. Run `swift test` for the candle aggregation and quote freshness checks. The build script packages an ad hoc signed universal app for Apple Silicon and Intel. GitHub Actions runs the tests, builds the bundle and verifies its signature and architectures.

| Location | Responsibility |
| --- | --- |
| [MarketFeeds](Sources/Troy/Markets/MarketFeeds.swift) and [MarketModels](Sources/Troy/Markets/MarketModels.swift) | Fetch quotes and determine freshness |
| [GoldMonitor](Sources/Troy/App/GoldMonitor.swift) and [QuoteStore](Sources/Troy/Persistence/QuoteStore.swift) | Coordinate sampling and SQLite storage |
| [MenuMonitor](Sources/Troy/MenuBar/MenuMonitor.swift) | Menu bar and threshold notifications |
| [Views](Sources/Troy/Views/DashboardView.swift) and [TapeChart](Sources/Troy/Views/TapeChart.swift) | SwiftUI dashboard and Apple Charts candlesticks |

[Tests/TroyTests](Tests/TroyTests) contains the XCTest suite. [Packaging/macOS](Packaging/macOS) holds the bundle metadata and icon. To release, update the version and build number in Info.plist and push the corresponding version tag (for example, `v1.3`). After verification, CI publishes the universal DMG and its SHA-256 checksum.

## License

[MIT](LICENSE) · Pixeldooooog
