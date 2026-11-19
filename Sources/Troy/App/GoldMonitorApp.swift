import AppKit
import SwiftUI
import Combine

private struct MonitorContent: View {
    @ObservedObject var model: GoldMonitor
    let menu: MenuMonitor

    var body: some View {
        DashboardView(quotes: model.quotes, history: model.history, statuses: model.statuses,
                      updatedAt: model.updatedAt, error: model.error, pin: menu.pin, editLimit: menu.configure)
            .environment(\.locale, Locale(identifier: "zh_CN"))
    }
}

@MainActor
private final class AppDelegate: NSObject, NSApplicationDelegate, NSToolbarDelegate {
    private let model = GoldMonitor()
    private var menuMonitor: MenuMonitor!
    private var window: NSWindow!
    private let activity = ProcessInfo.processInfo.beginActivity(
        options: .userInitiatedAllowingIdleSystemSleep, reason: "在Troy打开期间采集行情"
    )
    private let timeLabel = NSTextField(labelWithString: "等待行情")
    private var observation: AnyCancellable?

    func applicationDidFinishLaunching(_ notification: Notification) {
        menuMonitor = MenuMonitor(model: model) { [weak self] in self?.showWindow() }
        makeMenus()
        let frame = NSRect(x: 0, y: 0, width: 1030, height: 660)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Troy"
        window.isReleasedWhenClosed = false
        window.contentViewController = NSHostingController(rootView: MonitorContent(model: model, menu: menuMonitor))
        window.setContentSize(frame.size)
        window.contentMinSize = NSSize(width: 940, height: 540)
        window.center()
        window.setFrameAutosaveName("GoldMonitorMainWindow")
        let toolbar = NSToolbar(identifier: "GoldMonitorToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        window.toolbarStyle = .unified
        window.toolbar = toolbar

        timeLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        timeLabel.textColor = .secondaryLabelColor
        timeLabel.alignment = .right
        timeLabel.setAccessibilityLabel("最近采集时间，北京时间")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = MarketQuote.beijing
        formatter.dateFormat = "MM-dd HH:mm:ss"
        observation = model.$updatedAt.compactMap { $0 }.sink { [weak self] value in
            self?.timeLabel.stringValue = "北京时间 " + formatter.string(from: value)
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            self, selector: #selector(refresh), name: NSWorkspace.didWakeNotification, object: nil
        )
        showWindow()
        model.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        ProcessInfo.processInfo.endActivity(activity)
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    @objc private func showWindow() {
        guard let window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func editAlert() { menuMonitor.editAlert() }

    @objc private func refresh() { model.refresh() }

    private func makeMenus() {
        let menu = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem()
            let child = NSMenu(title: title)
            menu.addItem(item)
            item.submenu = child
            return child
        }
        let app = submenu("Troy")
        app.addItem(withTitle: "关于Troy", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(withTitle: "价格提醒…", action: #selector(editAlert), keyEquivalent: ",").target = self
        app.addItem(.separator())
        let services = NSMenu(title: "服务")
        let servicesItem = NSMenuItem(title: "服务", action: nil, keyEquivalent: "")
        app.addItem(servicesItem)
        servicesItem.submenu = services
        NSApp.servicesMenu = services
        app.addItem(.separator())
        app.addItem(withTitle: "隐藏Troy", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
            .keyEquivalentModifierMask = [.option, .command]
        app.addItem(withTitle: "全部显示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "退出Troy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = submenu("文件")
        file.addItem(withTitle: "打开Troy", action: #selector(showWindow), keyEquivalent: "0").target = self
        file.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = submenu("编辑")
        edit.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let view = submenu("显示")
        view.addItem(withTitle: "刷新行情", action: #selector(refresh), keyEquivalent: "r").target = self
        view.addItem(withTitle: "进入全屏幕", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            .keyEquivalentModifierMask = [.control, .command]
        let windows = submenu("窗口")
        windows.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windows.addItem(withTitle: "前置全部窗口", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windows
        NSApp.mainMenu = menu
    }

    private let clockID = NSToolbarItem.Identifier("quote-clock")
    private let refreshID = NSToolbarItem.Identifier("refresh-quotes")
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.flexibleSpace, clockID, refreshID] }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { toolbarAllowedItemIdentifiers(toolbar) }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: identifier)
        if identifier == clockID {
            item.label = "最近采集时间"
            item.view = timeLabel
            timeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 150).isActive = true
        } else if identifier == refreshID {
            item.label = "刷新行情"
            item.toolTip = "刷新行情（⌘R）"
            item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: item.label)
            item.target = self
            item.action = #selector(refresh)
        } else { return nil }
        return item
    }
}

@main
struct GoldMonitorApp {
    @MainActor static func main() {
        let args = CommandLine.arguments
        if args.dropFirst().first == "--import-legacy" {
            guard args.count == 3 else { exit(2) }
            do {
                let store = try QuoteStore()
                let count = try store.importLegacy(from: URL(fileURLWithPath: args[2]))
                print("已导入 \(count) 条历史报价")
            } catch {
                FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
                exit(1)
            }
            return
        }
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.setActivationPolicy(.regular)
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
