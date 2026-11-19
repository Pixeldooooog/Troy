<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/troy-banner-dark.webp">
    <img src="assets/troy-banner-light.webp" width="100%" alt="Troy, a floppy-eared dog beside a gold assay balance">
  </picture>
</p>

<h3 align="center">Your gold accumulation accounts and the gold market, on one dashboard.</h3>

<p align="center">
  <a href="https://github.com/Pixeldooooog/Troy/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pixeldooooog/Troy/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Pixeldooooog/Troy/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pixeldooooog/Troy?style=flat-square&color=8A6A1F"></a>
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/core-Rust-B7410E?style=flat-square&logo=rust&logoColor=white">
  <img alt="macOS 14+ · Windows" src="https://img.shields.io/badge/macOS%2014%2B%20%C2%B7%20Windows-124848?style=flat-square">
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a><br>
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#markets">Markets</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#development">Development</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#faq">FAQ</a>
</p>

---

Named for the troy ounce, Troy lives in the macOS menu bar or the Windows tray and samples gold accumulation quotes from six banks, Shanghai Gold Exchange Au99.99 and international spot gold. Quotes, history and settings stay on your computer. No account, nothing uploaded.

<a id="install"></a>

## 📦 Install

Download the latest build from [GitHub Releases](https://github.com/Pixeldooooog/Troy/releases/latest).

| Platform                          | File                                | Notes                                      |
| :-------------------------------- | :---------------------------------- | :----------------------------------------- |
| macOS 14+ (Apple Silicon & Intel) | `Troy-vX.Y.Z-macOS-universal.dmg`   | Open the DMG and drag Troy to Applications |
| Windows 11 x64                    | `Troy-vX.Y.Z-Windows-x64-setup.exe` | Run the installer                          |

> [!NOTE]
> The Mac app is ad hoc signed and not notarized, so allow it under **System Settings → Privacy & Security** on first launch. The Windows installer is unsigned and SmartScreen may warn. Every release ships a `SHA256SUMS.txt`.

<a id="features"></a>

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

**📊 Overview dashboard**<br>
A card per account you hold with day change, a 30-minute sparkline and the premium over SGE, all on one screen.

</td>
<td width="50%" valign="top">

**💰 Holdings P&L**<br>
Enter grams and cost to see market value at redemption price, unrealized P&L and today's change.

</td>
</tr>
<tr>
<td valign="top">

**📈 Relative performance**<br>
Overlay your accounts with SGE and spot gold as percentage change from the first sample. Toggle each line.

</td>
<td valign="top">

**🏦 Price ranking**<br>
Comparable bank purchase prices from cheapest up, with the gap to the lowest.

</td>
</tr>
<tr>
<td valign="top">

**🔔 Price alerts**<br>
One target per market. Alerts once at or below the target and re-arms after the price rises above it.

</td>
<td valign="top">

**🕯️ Charts**<br>
Line, 1/5-minute candles and daily, weekly and monthly candles, in original units, CNY per gram, or first = 100.

</td>
</tr>
<tr>
<td valign="top">

**🖥️ Always running**<br>
Closing the window keeps sampling in the menu bar or tray, with your pinned market's price always visible.

</td>
<td valign="top">

**🌗 Your way**<br>
Chinese or English, light or dark, red-up or green-up, a collapsible sidebar and a scrolling ticker.

</td>
</tr>
</table>

<a id="markets"></a>

## 🏦 Markets

| Market                            | Unit   | Quote                                       | Poll |
| :-------------------------------- | :----- | :------------------------------------------ | ---: |
| ICBC gold accumulation            | CNY/g  | Purchase price, redemption shown separately | 15 s |
| China Merchants Bank gold account | CNY/g  | Customer purchase price, with redemption    | 15 s |
| CCB gold accumulation             | CNY/g  | Official purchase and redemption prices     | 30 s |
| Minsheng gold (JD Finance)        | CNY/g  | Reference price, no redemption              | 30 s |
| Zheshang gold (JD Finance)        | CNY/g  | Reference price, no redemption              | 30 s |
| UOB Gold Savings Account          | SGD/g  | Official bank sell and buy prices           | 60 s |
| Shanghai Gold Exchange Au99.99    | CNY/g  | Official delayed quote                      | 30 s |
| International spot gold XAU/USD   | USD/oz | Live proxy quote                            | 10 s |
| USD/CNY                           | —      | Used only for unit conversion               | 60 s |

Each quote is **Live**, **Delayed**, **Last known**, **Stale** or **Unavailable**. Stale quotes never trigger alerts. Troy shows the bank's own quote time when it publishes one and the local observation time otherwise.

<a id="usage"></a>

## 🚀 Usage

1. Open **Settings → Holdings** and tick the accounts you hold. Grams and cost are optional and enable P&L.
2. The **Overview** shows your holdings, relative performance, benchmarks and the price ranking. Click any card or ticker item for details.
3. On a market's page, **pin it to the menu bar or tray** or **set a price alert**.

| Shortcut                   | Action         |
| :------------------------- | :------------- |
| <kbd>⌘</kbd> <kbd>1</kbd>  | Go to overview |
| <kbd>⌘</kbd> <kbd>\\</kbd> | Toggle sidebar |
| <kbd>⌘</kbd> <kbd>,</kbd>  | Open settings  |

Use <kbd>Ctrl</kbd> instead of <kbd>⌘</kbd> on Windows.

On macOS, closing the window, pressing <kbd>⌘</kbd> <kbd>Q</kbd> or quitting from the Dock hides the window and Dock icon while sampling continues. Choose **打开 Troy** in the menu bar to bring it back and **退出 Troy** to quit.

<a id="development"></a>

## 🛠️ Development

**Prerequisites:** stable Rust, Node.js 22.12+ and npm. On macOS, Xcode Command Line Tools. On Windows, MSVC C++ Build Tools, the Windows SDK and WebView2 Runtime.

```sh
git clone https://github.com/Pixeldooooog/Troy.git
cd Troy
npm ci
npm run tauri dev      # desktop app with hot reload
```

| Command                           | What it does                                            |
| :-------------------------------- | :------------------------------------------------------ |
| `npm run tauri dev`               | Run the desktop app in development                      |
| `npm run dev:mock`                | Run only the UI in a browser with mock quotes (no Rust) |
| `npm run tauri build`             | Build installers                                        |
| `npm run lint` · `npm run format` | ESLint · Prettier                                       |
| `npm run typecheck`               | TypeScript type check                                   |

**Data:** the database lives at `v2/quotes.sqlite3` in the app data directory. On first run on a Mac, Troy imports a consistent snapshot of the v1 database and preferences. Set `TROY_DATA_DIR` to a scratch directory during development to skip the import.

**Tests:** from the repository root:

```sh
cargo test --locked -p troy-core                       # quote rules, time, aggregation, conversion, alerts, migration (offline)
cargo test --locked --workspace                        # run npm run build first
cargo clippy --workspace --all-targets -- -D warnings
```

<a id="architecture"></a>

## 🧭 Architecture

```text
.
├── src/                    React + TypeScript window
│   ├── App.tsx               routing and shortcuts
│   ├── pages/                Overview · MarketDetail · Settings
│   ├── components/           Sidebar, Ticker, charts/ (candles, comparison, sparkline)
│   ├── hooks/                snapshot subscription, series data
│   ├── lib/                  typed IPC (api.ts), types, market constants, formatting
│   ├── i18n/                 zh / en strings
│   ├── store/                local preferences (language, theme, holdings)
│   ├── styles/               design tokens and per-area styles
│   └── mocks/                Tauri stand-ins for browser mode
├── src-tauri/              Tauri 2 host: window, menu bar/tray, IPC commands
├── crates/troy-core/       Rust core, runs without the desktop shell
│   └── src/                  feeds · market · monitor · storage
├── docs/                   architecture notes
└── .github/workflows/      CI and releases
```

Sampling, storage and alerts all run in one Rust process, so hiding, reopening or reloading the window never interrupts them. See the [architecture notes](docs/architecture/desktop-v2.zh-CN.md) (Chinese) for the design.

<a id="faq"></a>

## ❓ FAQ

<details>
<summary><b>How is the day change calculated?</b></summary>

Against the last quote this computer recorded on the previous Beijing calendar day, not the bank's official close. If Troy wasn't running that day there is no baseline and it shows "—".

</details>

<details>
<summary><b>Why value holdings at the redemption price?</b></summary>

It's what you would get if you sold now. Markets without a redemption price (the two JD Finance products) fall back to the purchase price.

</details>

<details>
<summary><b>Where are my holdings stored?</b></summary>

Only on this computer, in the window's local storage and `quotes.sqlite3`. Troy uploads no personal data.

</details>

<details>
<summary><b>Why are parts of the chart blank?</b></summary>

Charts only draw quotes this computer actually observed. Periods when the computer slept or a source was down stay blank instead of being interpolated.

</details>

<details>
<summary><b>Where did the Swift version go?</b></summary>

Troy 1.x was a native SwiftUI app for macOS. Troy 2 replaces it on both platforms and imports its data on first launch. The Swift source remains available under the `v1.*` tags.

</details>

## 🚢 Releases

On every push to main and every pull request, [CI](.github/workflows/ci.yml) runs ESLint, the Prettier check, the frontend build, Rust tests and Clippy on macOS and Windows, then compiles the desktop host.

To release, bump the version in `src-tauri/tauri.conf.json` on main, then run the [Release](https://github.com/Pixeldooooog/Troy/actions/workflows/release.yml) workflow on **main** with the matching tag (for example `v2.0.2`), or push the tag. The pipeline rebuilds and tests on both platforms, builds the universal DMG and the Windows x64 installer, smoke-tests mounting, installation and launch, then publishes the release with SHA-256 checksums and verifies the public downloads.

## 📄 License

[MIT](LICENSE) © Pixeldooooog
