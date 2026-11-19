import XCTest
@testable import Troy

final class MarketTests: XCTestCase {
    func testCandlesUseChronologicalPricesAndSkipEmptyMinutes() {
        let points = [(59, 11.0), (0, 10.0), (20, 9.0), (40, 12.0), (120, 8.0)].map {
            PricePoint(time: Date(timeIntervalSince1970: Double($0.0)), value: $0.1)
        }
        let start = Date(timeIntervalSince1970: 0)
        let end = start.addingTimeInterval(120)
        let bars = QuoteCandle.aggregate(points, seconds: 60, start: start, end: end)
        XCTAssertEqual(bars.map(\.id), [start, end])
        XCTAssertEqual(bars.map(\.count), [4, 1])
        XCTAssertEqual(bars.map(\.open), [10, 8])
        XCTAssertEqual(bars.map(\.low), [9, 8])
        XCTAssertEqual(bars.map(\.high), [12, 8])
        XCTAssertEqual(bars.map(\.close), [11, 8])
        let fiveMinutes = QuoteCandle.aggregate(points, seconds: 300, start: start, end: end)
        XCTAssertEqual(fiveMinutes.map(\.close), [8])
    }

    func testFreshPollCanContainAnExpiredQuote() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        var quote = MarketQuote(instrument: .london, value: 2000, source: "fixture",
                                observedAt: now, publishedAt: now)
        XCTAssertTrue(quote.isCurrent(at: now))
        quote.publishedAt = now.addingTimeInterval(-301)
        XCTAssertFalse(quote.isCurrent(at: now))
    }
}
