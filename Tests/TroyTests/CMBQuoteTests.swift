import XCTest
@testable import Troy

final class CMBQuoteTests: XCTestCase {
    private func response(buy: String = "805.10", sell: String = "800.10",
                          open: Bool = true, quoted: Bool = true) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "code": "SUC0000", "success": true,
            "data": ["NowTime": "2026/11/19 13:50:20", "MarketDay": open, "QuotedPrice": quoted,
                     "FQAMBPRCZ1": ["zBuyPrc": buy, "zSelPrc": sell]]
        ])
    }

    func testCustomerBuyIsTheMonitoredPrice() throws {
        let quote = try MarketFeeds.cmbQuote(response())
        XCTAssertEqual(quote.instrument, .cmb)
        XCTAssertEqual(quote.value, 805.10)
        XCTAssertEqual(quote.redemption, 800.10)
        XCTAssertEqual(quote.publishedAt, ISO8601DateFormatter().date(from: "2026-11-19T05:50:20Z"))
        XCTAssertTrue(Instrument.gold.contains(.cmb))
    }

    func testInactiveAndIncompleteQuotesAreRejected() throws {
        XCTAssertThrowsError(try MarketFeeds.cmbQuote(response(open: false)))
        XCTAssertThrowsError(try MarketFeeds.cmbQuote(response(quoted: false)))
        XCTAssertThrowsError(try MarketFeeds.cmbQuote(response(buy: "--")))
        XCTAssertThrowsError(try MarketFeeds.cmbQuote(response(sell: "0")))
    }
}
