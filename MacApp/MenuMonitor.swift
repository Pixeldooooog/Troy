import AppKit
import UserNotifications

@MainActor
final class MenuMonitor: NSObject, NSMenuDelegate, UNUserNotificationCenterDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let model: GoldMonitor
    private let openWindow: () -> Void
    private let defaults = UserDefaults.standard
    private var requesting: Set<Instrument> = []
    private var selected: Instrument {
        get { Instrument(rawValue: defaults.string(forKey: "menuMarket") ?? "") ?? .icbc }
        set { defaults.set(newValue.rawValue, forKey: "menuMarket") }
    }

    init(model: GoldMonitor, open: @escaping () -> Void) {
        self.model = model
        self.openWindow = open
        super.init()
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        item.button?.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        UNUserNotificationCenter.current().delegate = self
        model.onQuote = { [weak self] in self?.evaluate($0) }
        model.onSnapshot = { [weak self] in self?.render() }
        render()
    }

    private func amount(_ value: Double) -> String { String(format: "%.2f", value) }
    private func targetKey(_ key: Instrument) -> String { "limit." + key.rawValue }
    private func latchKey(_ key: Instrument) -> String { "below." + key.rawValue }

    private func render() {
        let k = selected
        let short = k == .icbc ? "工行" : k == .sge ? "上金所" : "国际金"
        let status = model.statuses[k]
        let suffix = status == "delayed" ? " 延" : status == "fresh" ? "" : " ·"
        let price = model.quotes[k].map { (k == .london ? "$" : "¥") + amount($0.value) } ?? "—"
        item.button?.title = short + " " + price + suffix
        item.button?.toolTip = k.name + " · " + k.unit + (status == "delayed" ? " · 官方延时" : status == "fresh" ? "" : " · 等待有效报价")
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        for k in Instrument.gold {
            let price = model.quotes[k].map { amount($0.value) + " " + k.unit } ?? "—"
            let status = model.statuses[k]
            let suffix = status == "delayed" ? " · 延时" : status == "fresh" ? "" : " · 等待更新"
            let row = menu.addItem(withTitle: k.name + "   " + price + suffix, action: #selector(selectMarket(_:)), keyEquivalent: "")
            row.target = self
            row.representedObject = k.rawValue
            row.state = selected == k ? .on : .off
        }
        menu.addItem(.separator())
        let limit = defaults.double(forKey: targetKey(selected))
        let title = limit > 0 ? "价格提醒 · ≤ " + amount(limit) + " " + selected.unit + "…" : "设置价格提醒…"
        menu.addItem(withTitle: title, action: #selector(editAlert), keyEquivalent: "").target = self
        if let last = defaults.string(forKey: "lastGoldAlert") {
            menu.addItem(withTitle: last, action: nil, keyEquivalent: "")
        }
        menu.addItem(withTitle: "打开黄金主盘", action: #selector(show), keyEquivalent: "").target = self
        menu.addItem(withTitle: "退出黄金主盘", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    }

    @objc private func selectMarket(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let k = Instrument(rawValue: raw) else { return }
        selected = k
        render()
    }

    @objc private func show() { openWindow() }

    func pin(_ k: Instrument) { selected = k; render() }

    @objc func editAlert() { configure(selected) }

    func configure(_ k: Instrument) {
        let alert = NSAlert()
        alert.messageText = k.name + "价格提醒"
        alert.informativeText = "报价首次达到或低于目标价时提醒。回升到目标价以上后，可再次触发。" + (k == .sge ? " 上金所使用官方延时报价。" : "")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 26))
        field.placeholderString = "目标价（" + k.unit + "）"
        field.setAccessibilityLabel(field.placeholderString)
        let limit = defaults.double(forKey: targetKey(k))
        if limit > 0 { field.stringValue = amount(limit) }
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        if limit > 0 { alert.addButton(withTitle: "关闭提醒") }
        NSApp.activate(ignoringOtherApps: true)
        while true {
            let result = alert.runModal()
            if result == .alertThirdButtonReturn {
                defaults.removeObject(forKey: targetKey(k))
                defaults.removeObject(forKey: latchKey(k))
            }
            guard result == .alertFirstButtonReturn else { return }
            guard let value = Double(field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)),
                  value.isFinite, value >= 0.01, value < 1_000_000_000 else {
                alert.informativeText = "请输入大于或等于 0.01 的有效价格，单位为" + k.unit + "。"
                continue
            }
            let target = (value * 100).rounded() / 100
            if target != limit { defaults.removeObject(forKey: latchKey(k)) }
            defaults.set(target, forKey: targetKey(k))
            requesting.insert(k)
            Task {
                _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
                requesting.remove(k)
                model.refresh()
            }
            return
        }
    }

    private func evaluate(_ q: MarketQuote) {
        let k = q.instrument
        let limit = defaults.double(forKey: targetKey(k))
        guard !requesting.contains(k), limit > 0, q.isCurrent(at: Date()) else { return }
        let below = q.value <= limit
        guard below != defaults.bool(forKey: latchKey(k)) else { return }
        defaults.set(below, forKey: latchKey(k))
        guard below else { return }
        let body = k.name + " " + amount(q.value) + " " + k.unit + "，目标价 " + amount(limit) + (k == .sge ? "（官方延时）" : "")
        let time = DateFormatter.localizedString(from: Date(), dateStyle: .short, timeStyle: .short)
        defaults.set("最近提醒 · " + time + " · " + body, forKey: "lastGoldAlert")
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                let content = UNMutableNotificationContent()
                content.title = "黄金主盘 · 到价提醒"
                content.body = body
                content.sound = .default
                do {
                    try await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
                    return
                } catch { }
            }
            NSSound.beep()
            NSApp.requestUserAttention(.informationalRequest)
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                             withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
