# Troy 2 本地开发

桌面宿主使用 Tauri 2，报价、采样、换算、阈值和数据迁移由共享 Rust crate `troy-core` 实现。当前窗口用于验证报价与交互，正式版 UI 尚在设计中。

需要稳定版 Rust、Node.js 22.12+ 和 npm。在 macOS 上使用 Xcode Command Line Tools，在 Windows 上使用 MSVC C++ Build Tools、Windows SDK 和 WebView2 Runtime。

在本目录执行以下命令准备静态窗口并启动宿主。

```sh
npm ci
npm run build
cargo run --locked -p troy-desktop --features custom-protocol
```

默认数据库位于应用数据目录的 `v2/quotes.sqlite3`。Mac 首次运行从旧库的一致快照和原应用偏好中导入。开发验证可设置 `TROY_DATA_DIR` 指向单独的测试目录，此时跳过自动导入。Mac 上关闭窗口、按 ⌘Q 或在 Dock 选择退出，会隐藏窗口与 Dock 图标，保留菜单栏报价和后台采集。从菜单栏选择「打开 Troy」可恢复窗口和 Dock 图标。点击菜单栏或 Windows 托盘菜单中的「退出 Troy」结束进程。

在仓库根目录运行 `cargo test --locked -p troy-core` 可离线验证报价口径、时间、采样聚合、汇率换算、提醒及迁移。构建完前端后可运行 `cargo test --locked --workspace` 和 `cargo clippy --workspace --all-targets -- -D warnings` 检查整个工程。

民生积存金和浙商积存金通过京东金融渠道每 30 秒读取一次。两款产品都按接口提供的参考价（元/克）展示和判断阈值；接口仅返回单一价格，因此赎回价留空。开发版同时保留工行、招行、上金所、国际现货黄金和换算汇率。

建行积存金使用建设银行官网的主动积存价和赎回价，每 30 秒查询。新加坡大华银行黄金储蓄账户每 60 秒查询官网挂牌价，以新元/克展示银行卖出价（客户买入）和银行买入价（客户赎回）。界面显示银行报价时间；超过时效的报价不会触发提醒。大华支持原始价格和相对走势视图。
