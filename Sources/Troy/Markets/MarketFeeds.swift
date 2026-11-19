import Foundation

/// The application contacts the publishers directly. No API keys or local proxy are required.
enum MarketFeeds {
    private struct FeedError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 7
        config.timeoutIntervalForResource = 10
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpShouldSetCookies = false
        return URLSession(configuration: config)
    }()

    static func fetch(_ instrument: Instrument) async throws -> MarketQuote {
        switch instrument {
        case .icbc:
            let data = try await request("https://mybank.icbc.com.cn/servlet/AsynGetDataServlet",
                                         form: "tranCode=A00622")
            return try bankQuote(data)
        case .sge:
            let data = try await request("https://www.sge.com.cn/sjzx/yshqbg")
            return try exchangeQuote(String(decoding: data, as: UTF8.self))
        case .london:
            do {
                return try spotQuote(await request("https://api.gold-api.com/price/XAU"))
            } catch {
                try Task.checkCancellation()
                return try await sina(.london)
            }
        case .fx:
            do {
                return try await sina(.fx)
            } catch {
                try Task.checkCancellation()
                return try dailyFX(await request("https://open.er-api.com/v6/latest/USD"))
            }
        }
    }

    static func sgeMinutes() async throws -> [PricePoint] {
        let data = try await request("https://www.sge.com.cn/graph/quotations?instid=Au99.99")
        return try exchangeMinutes(data)
    }

    private static func request(_ address: String, form: String? = nil, referer: String? = nil) async throws -> Data {
        var request = URLRequest(url: URL(string: address)!)
        request.setValue("GoldMonitor/1.0 (macOS)", forHTTPHeaderField: "User-Agent")
        if let referer { request.setValue(referer, forHTTPHeaderField: "Referer") }
        if let form {
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(form.utf8)
        }
        let (data, result) = try await session.data(for: request)
        guard let response = result as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw FeedError("行情服务暂不可用（HTTP \((result as? HTTPURLResponse)?.statusCode ?? 0)）")
        }
        return data
    }

    private static func object(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FeedError("行情服务返回了未知格式")
        }
        return object
    }

    // Publishers use a mixture of decimal strings and JSON numbers. Zero and bank
    // placeholders denote an unavailable quote, never a valid market price.
    private static func price(_ input: Any?) -> Double? {
        let number: Double?
        if let value = input as? String {
            number = Double(value.replacingOccurrences(of: ",", with: ""))
        } else if let value = input as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() {
            number = value.doubleValue
        } else {
            number = nil
        }
        guard let number, number.isFinite, number > 0 else { return nil }
        return number
    }

    private static func groups(_ text: String, _ pattern: String) -> [[String]] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators, .caseInsensitive]) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).map { match in
            (1..<match.numberOfRanges).map {
                Range(match.range(at: $0), in: text).map { String(text[$0]) } ?? ""
            }
        }
    }

    private static func dateFormatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = MarketQuote.beijing
        formatter.dateFormat = format
        formatter.isLenient = false
        return formatter
    }

    private static func beijingDate(_ text: String, format: String) -> Date? {
        let formatter = dateFormatter(format)
        guard let date = formatter.date(from: text), formatter.string(from: date) == text else { return nil }
        return date
    }

    private static func dayString(_ parts: [String]) -> String? {
        guard parts.count >= 3, let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return nil }
        let padded = String(format: "%04d-%02d-%02d", year, month, day)
        return beijingDate(padded, format: "yyyy-MM-dd") == nil ? nil : padded
    }

    static func bankQuote(_ data: Data) throws -> MarketQuote {
        let response = try object(data)
        guard (response["TranErrorCode"] as? String ?? "").isEmpty,
              let products = response["rf"] as? [[String: Any]],
              let row = products.first(where: { $0["goldTypeNo"] as? String == "JC001" }),
              let value = price(row["ActivePrice"]) else { throw FeedError("工行未返回有效的 JC001 主动积存价") }
        let tradeDate = (row["ActiveDate"] as? String).flatMap { beijingDate($0, format: "yyyy-MM-dd") != nil ? $0 : nil }
        // sysdate is the bank's response clock. ActiveDate is the only quote date.
        return MarketQuote(instrument: .icbc, value: value, source: "工商银行官网 · JC001", observedAt: Date(),
                           tradeDate: tradeDate, redemption: price(row["SellPrice"]),
                           high: price(row["HighPrice"]), low: price(row["LowPrice"]))
    }

    static func exchangeQuote(_ html: String) throws -> MarketQuote {
        let tradeDate = groups(html, #"上海黄金交易所\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*延时行情"#).first.flatMap(dayString)
        for row in groups(html, #"<tr\b[^>]*>(.*?)</tr>"#) {
            let cells = groups(row[0], #"<td\b[^>]*>(.*?)</td>"#).map {
                $0[0].replacingOccurrences(of: #"<[^>]*>"#, with: "", options: .regularExpression)
                    .replacingOccurrences(of: "&nbsp;", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            }
            guard cells.count >= 5, cells[0] == "Au99.99", let value = price(cells[1]) else { continue }
            let published = cells.count > 5 ? beijingDate(cells[5], format: "yyyy-MM-dd HH:mm:ss") : nil
            return MarketQuote(instrument: .sge, value: value, source: "上海黄金交易所 · 延时", observedAt: Date(),
                               publishedAt: published, tradeDate: tradeDate, high: price(cells[2]), low: price(cells[3]))
        }
        throw FeedError("上金所未返回有效的 Au99.99 报价")
    }

    static func spotQuote(_ data: Data) throws -> MarketQuote {
        let row = try object(data)
        guard let value = price(row["price"]), ["XAU", "XAUUSD"].contains(row["symbol"] as? String ?? "XAU"),
              (row["currency"] as? String ?? "USD") == "USD" else { throw FeedError("国际现货品种或价格无效") }
        let iso = ISO8601DateFormatter()
        var published: Date?
        if let stamp = row["updatedAt"] as? String {
            published = iso.date(from: stamp)
            if published == nil {
                iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                published = iso.date(from: stamp)
            }
        }
        if published == nil, let epoch = price(row["timestamp"]) {
            published = Date(timeIntervalSince1970: epoch)
        }
        guard let published else { throw FeedError("国际现货缺少报价时间") }
        return MarketQuote(instrument: .london, value: value, source: "Gold API", observedAt: Date(), publishedAt: published)
    }

    private static func sina(_ instrument: Instrument) async throws -> MarketQuote {
        let symbol = instrument == .fx ? "fx_susdcny" : "hf_XAU"
        let data = try await request("https://hq.sinajs.cn/list=" + symbol, referer: "https://finance.sina.com.cn/")
        // All fields used below are ASCII; the unused descriptions are GBK.
        return try sinaQuote(String(decoding: data, as: UTF8.self), instrument: instrument)
    }

    static func sinaQuote(_ text: String, instrument: Instrument) throws -> MarketQuote {
        let isFX = instrument == .fx
        let symbol = isFX ? "fx_susdcny" : "hf_XAU"
        guard let record = groups(text, #"hq_str_"# + symbol + #"="([^"]+)""#).first?.first else {
            throw FeedError("新浪未返回指定品种的报价")
        }
        let fields = record.components(separatedBy: ",")
        guard fields.count >= (isFX ? 10 : 13), let value = price(fields[isFX ? 8 : 0]) else {
            throw FeedError("新浪行情价格无效")
        }
        let day = isFX ? fields.last! : fields[12]
        let clock = fields[isFX ? 0 : 6]
        guard let stamp = beijingDate(day + " " + clock, format: "yyyy-MM-dd HH:mm:ss") else {
            throw FeedError("新浪行情缺少有效报价时间")
        }
        return MarketQuote(instrument: instrument, value: value, source: isFX ? "新浪财经 · 在岸人民币" : "新浪财经 · 伦敦现货",
                           observedAt: Date(), publishedAt: stamp, high: isFX ? nil : price(fields[4]),
                           low: isFX ? nil : price(fields[5]), isFallback: !isFX)
    }

    static func dailyFX(_ data: Data) throws -> MarketQuote {
        let row = try object(data)
        guard (row["base_code"] as? String) == "USD", let rates = row["rates"] as? [String: Any],
              let value = price(rates["CNY"]), let epoch = price(row["time_last_update_unix"]) else {
            throw FeedError("每日参考汇率不可用")
        }
        return MarketQuote(instrument: .fx, value: value, source: "ExchangeRate-API 每日参考", observedAt: Date(),
                           publishedAt: Date(timeIntervalSince1970: epoch), isFallback: true, isDailyReference: true)
    }

    // One grid spans multiple calendar dates. Only the dated trading segment is
    // unambiguous (a Friday night must never be assigned to a Monday session).
    static func exchangeMinutes(_ data: Data, observedAt: Date = Date()) throws -> [PricePoint] {
        let row = try object(data)
        guard row["heyue"] as? String == "Au99.99", let clocks = row["times"] as? [String],
              let values = row["data"] as? [Any] else { throw FeedError("上金所分钟行情格式无效") }
        let pattern = #"^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{2}:\d{2}):[0-5]\d$"#
        guard let parts = groups(row["delaystr"] as? String ?? "", pattern).first, let day = dayString(parts),
              let midnight = beijingDate(day, format: "yyyy-MM-dd"), let lastPublished = minute(parts[3]),
              let dataCutoff = minute(row["now"] as? String ?? "") else { return [] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = MarketQuote.beijing
        let weekday = calendar.component(.weekday, from: midnight)
        let segment: ClosedRange<Int>
        if lastPublished >= 20 * 60 && (2...6).contains(weekday) {
            segment = (20 * 60)...1439
        } else if lastPublished < 9 * 60 && (3...7).contains(weekday) {
            segment = 0...150
        } else if lastPublished >= 9 * 60 && lastPublished < 20 * 60 && (2...6).contains(weekday) {
            segment = (9 * 60)...930
        } else { return [] }
        let placeholder = price(row["min"]).map { $0 - 2 }
        let cutoff = min(lastPublished, dataCutoff)
        var points = [PricePoint]()
        for (clock, raw) in zip(clocks, values) {
            guard let minute = minute(clock), segment.contains(minute), minute <= cutoff,
                  let value = price(raw), value != placeholder else { continue }
            let time = midnight.addingTimeInterval(Double(minute * 60))
            guard time <= observedAt, points.last.map({ time > $0.time }) ?? true else { continue }
            points.append(PricePoint(time: time, value: value))
        }
        return points
    }

    private static func minute(_ text: String) -> Int? {
        let components = text.split(separator: ":")
        guard components.count == 2, components.allSatisfy({ $0.count == 2 }),
              let hour = Int(components[0]), (0...23).contains(hour),
              let minute = Int(components[1]), (0...59).contains(minute) else { return nil }
        return hour * 60 + minute
    }
}
