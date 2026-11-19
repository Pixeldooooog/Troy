import Foundation
import Combine

@MainActor
final class GoldMonitor: ObservableObject {
    @Published private(set) var quotes: [Instrument: MarketQuote] = [:]
    @Published private(set) var history: [Instrument: [PricePoint]] = [:]
    @Published private(set) var statuses: [Instrument: String] = [:]
    @Published private(set) var updatedAt: Date?
    @Published private(set) var error: String?

    var onQuote: ((MarketQuote) -> Void)?
    var onSnapshot: (() -> Void)?
    private var store: QuoteStore?
    private var storageError: String?
    private var localHistory: [Instrument: [PricePoint]] = [:]
    private var exchangeMinutes: [PricePoint] = []
    private var running: [Instrument: Task<Void, Never>] = [:]
    private var minutesTask: Task<Void, Never>?
    private var timer: Timer?
    private var nextFetch: [Instrument: Date] = [:]
    private var nextMinutes = Date.distantPast
    private var failed: Set<Instrument> = []
    private var received: Set<Instrument> = []

    init() {
        do {
            let database = try QuoteStore()
            store = database
            quotes = try database.latest()
            localHistory = try database.history(since: Date().addingTimeInterval(-1800))
            history = localHistory
        } catch {
            storageError = "本地历史记录暂不可用。"
            self.error = storageError
        }
        for key in Instrument.allCases {
            statuses[key] = quotes[key] == nil ? "loading" : "cached"
        }
    }

    func start() {
        guard timer == nil else { return }
        refresh()
        let clock = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.schedule() }
        }
        clock.tolerance = 0.25
        RunLoop.main.add(clock, forMode: .common)
        timer = clock
    }

    func refresh() {
        nextFetch.removeAll()
        nextMinutes = .distantPast
        schedule()
    }

    private func schedule() {
        let now = Date()
        for key in Instrument.allCases where running[key] == nil && (nextFetch[key] ?? .distantPast) <= now {
            running[key] = Task { [weak self] in
                guard let self else { return }
                do {
                    let quote = try await MarketFeeds.fetch(key)
                    guard !Task.isCancelled else { return }
                    receive(quote)
                    onQuote?(quote)
                } catch {
                    guard !Task.isCancelled else { return }
                    failed.insert(key)
                }
                nextFetch[key] = Date().addingTimeInterval(key.interval)
                running[key] = nil
                publish()
            }
        }
        if minutesTask == nil && nextMinutes <= now {
            minutesTask = Task { [weak self] in
                guard let self else { return }
                let minutes = try? await MarketFeeds.sgeMinutes()
                guard !Task.isCancelled else { return }
                // A failed minute feed must not hide newer table observations.
                exchangeMinutes = minutes ?? []
                nextMinutes = Date().addingTimeInterval(60)
                minutesTask = nil
                publish()
            }
        }
    }

    private func receive(_ quote: MarketQuote) {
        quotes[quote.instrument] = quote
        received.insert(quote.instrument)
        failed.remove(quote.instrument)
        updatedAt = max(updatedAt ?? .distantPast, quote.observedAt)
        do {
            try store?.save(quote)
            if store != nil { storageError = nil }
        } catch {
            storageError = "本地历史记录写入失败，本次报价仍可查看。"
        }
        guard quote.instrument != .fx, quote.isCurrent(at: Date()) else { return }
        let point = PricePoint(time: quote.publishedAt ?? quote.observedAt, value: quote.value)
        var points = localHistory[quote.instrument] ?? []
        // A provider can repeat or revise the same publication on consecutive polls.
        if let index = points.lastIndex(where: { $0.time == point.time }) {
            points[index] = point
        } else {
            points.append(point)
        }
        localHistory[quote.instrument] = points
    }

    private func publish() {
        let now = Date()
        let cutoff = now.addingTimeInterval(-1800)
        for key in Instrument.allCases {
            if failed.contains(key) {
                statuses[key] = quotes[key] == nil ? "error" : "cached"
            } else if let quote = quotes[key] {
                if !received.contains(key) { statuses[key] = "cached" }
                else if !quote.isCurrent(at: now) { statuses[key] = "stale" }
                else if key == .sge || quote.isDailyReference { statuses[key] = "delayed" }
                else { statuses[key] = "fresh" }
            }
        }
        var series: [Instrument: [PricePoint]] = [:]
        for key in Instrument.gold {
            localHistory[key]?.removeAll { $0.time < cutoff }
            series[key] = localHistory[key]
        }
        let minutes = exchangeMinutes.filter { $0.time >= cutoff && $0.time <= now }
        if !minutes.isEmpty { series[.sge] = minutes }
        history = series
        onSnapshot?()
        let allUnavailable = Instrument.gold.allSatisfy { failed.contains($0) }
        error = storageError ?? (allUnavailable ? "行情源暂时无法连接，正在自动重试。" : nil)
    }
}
