import Foundation

enum Instrument: String, CaseIterable, Codable, Sendable {
    case icbc = "icbc_acc_gold_buy"
    case sge = "sge_au9999"
    case london = "xauusd_live_proxy"
    case fx = "usd_cny"

    static let gold: [Self] = [.icbc, .sge, .london]

    var interval: TimeInterval {
        switch self {
        case .icbc: 15
        case .sge: 30
        case .london: 10
        case .fx: 60
        }
    }
}

struct MarketQuote: Codable, Sendable {
    let instrument: Instrument
    let value: Double
    let source: String
    let observedAt: Date
    var publishedAt: Date? = nil
    var tradeDate: String? = nil
    var redemption: Double? = nil
    var high: Double? = nil
    var low: Double? = nil
    var isFallback = false
    var isDailyReference = false

    static let beijing = TimeZone(identifier: "Asia/Shanghai")!

    func isCurrent(at now: Date) -> Bool {
        if now.timeIntervalSince(observedAt) > max(instrument.interval * 3, 120) { return false }
        if let tradeDate {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = Self.beijing
            let day = calendar.dateComponents([.year, .month, .day], from: now)
            if tradeDate < String(format: "%04d-%02d-%02d", day.year!, day.month!, day.day!) { return false }
        }
        if let publishedAt {
            let age = now.timeIntervalSince(publishedAt)
            return age >= -60 && age <= (isDailyReference ? 4 * 86_400 : 300)
        }
        return tradeDate != nil
    }
}

struct PricePoint: Codable, Equatable, Sendable {
    let time: Date
    let value: Double
}
