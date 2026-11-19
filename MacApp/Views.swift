import SwiftUI
import Charts

extension Instrument {

    var name: String {
        switch self {
        case .icbc: "工行积存金"
        case .sge: "上金所 Au99.99"
        case .london: "国际现货黄金"
        case .fx: "美元兑人民币"
        }
    }

    var unit: String { self == .london ? "美元/盎司" : "元/克" }

    var color: Color {
        switch self {
        case .icbc: .orange
        case .sge: .teal
        case .london: .indigo
        case .fx: .secondary
        }
    }
}

private enum DisplayMode: String, CaseIterable, Identifiable {
    case original = "原始价格"
    case compare = "人民币对比"
    case index = "相对波动"

    var id: Self { self }
}

private enum DisplayFormat {
    static let beijing = TimeZone(identifier: "Asia/Shanghai")!
    static let clock = clockFormat("HH:mm:ss")
    static let axis = clockFormat("HH:mm")
    static let dateTime = clockFormat("MM-dd HH:mm:ss")

    private static func clockFormat(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = beijing
        formatter.dateFormat = format
        return formatter
    }

    static func number(_ value: Double, digits: Int = 2) -> String {
        value.formatted(.number.locale(Locale(identifier: "zh_CN")).precision(.fractionLength(digits)))
    }
}

struct DashboardView: View {
    let quotes: [Instrument: MarketQuote]
    let history: [Instrument: [PricePoint]]
    let statuses: [Instrument: String]
    let updatedAt: Date?
    let error: String?
    let pin: (Instrument) -> Void
    let editLimit: (Instrument) -> Void

    @AppStorage("goldChartMode") private var mode: DisplayMode = .original
    @State private var cursor: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.callout).foregroundStyle(.orange)
                    .accessibilityLabel("行情状态，" + error)
            }
            HStack(spacing: 0) {
                ForEach(Instrument.gold, id: \.self) { market in
                    if market != .icbc { Divider().padding(.vertical, 3) }
                    VStack(alignment: .leading, spacing: 10) {
                        QuoteColumn(market: market, quote: quotes[market], state: statuses[market])
                        MarketActions(market: market, pin: pin, editLimit: editLimit)
                            .padding(.horizontal, 16)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 15)
            .modifier(PanelBackground())
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("黄金走势").font(.title3.weight(.semibold))
                        Text("近 30 分钟 · 北京时间").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Picker("走势图模式", selection: $mode) {
                        ForEach(DisplayMode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .labelsHidden().pickerStyle(.segmented).fixedSize()
                    .accessibilityLabel("走势图模式")
                }
                HStack(spacing: 18) {
                    ForEach(Instrument.gold, id: \.self) { market in
                        HStack(spacing: 5) {
                            Capsule().fill(market.color).frame(width: 14, height: 3)
                            Text(market.name)
                        }
                    }
                    Spacer(minLength: 4)
                    Text(chartUnits)
                        .multilineTextAlignment(.trailing)
                }
                .font(.caption).foregroundStyle(.secondary)

                let model = PlotModel(history: history, fx: usdCny, end: Date(), mode: mode)
                NativePriceChart(model: model, cursor: $cursor)
                    .frame(minHeight: 160, maxHeight: .infinity)
                CursorSummary(model: model, cursor: cursor)
                    .help(updatedAt.map { "最近成功采集 " + DisplayFormat.dateTime.string(from: $0) } ?? "等待首次采集")
            }
            .padding(18)
            .modifier(PanelBackground())

            HStack(spacing: 16) {
                spread("工行较上金所", current(.icbc), current(.sge))
                Divider().frame(height: 12)
                spread("上金所较国际金", current(.sge), convertedGold)
                Divider().frame(height: 12)
                spread("工行较国际金", current(.icbc), convertedGold)
                Spacer()
            }
            .font(.caption)
        }
        .padding(.horizontal, 22).padding(.vertical, 18)
        .frame(minWidth: 735, minHeight: 528)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var usdCny: Double? { current(.fx) }

    private var chartUnits: String {
        switch mode {
        case .original: return "左轴 元/克　右轴 美元/盎司"
        case .compare:
            if let usdCny, usdCny > 0 {
                return "元/克 · " + (quotes[.fx]?.isDailyReference == true ? "每日参考汇率" : "美元兑人民币") + " " + DisplayFormat.number(usdCny, digits: 4)
            }
            return "元/克 · 汇率暂缺"
        case .index: return "窗口首笔 = 100"
        }
    }

    private func current(_ market: Instrument) -> Double? {
        guard let quote = quotes[market], let status = statuses[market], ["fresh", "delayed"].contains(status) else { return nil }
        return quote.value
    }

    private var convertedGold: Double? {
        guard let gold = current(.london), let usdCny, usdCny > 0 else { return nil }
        return gold * usdCny / 31.1034768
    }

    private func spread(_ label: String, _ numerator: Double?, _ denominator: Double?) -> some View {
        let delta: String = {
            guard let numerator, let denominator, denominator > 0 else { return "—" }
            let value = (numerator / denominator - 1) * 100
            return (value > 0 ? "+" : "") + DisplayFormat.number(value) + "%"
        }()
        return HStack(spacing: 6) {
            Text(label).foregroundStyle(.secondary)
            Text(delta).monospacedDigit()
        }
    }
}

private struct PanelBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
    }
}

private struct MarketActions: View {
    let market: Instrument
    let pin: (Instrument) -> Void
    let editLimit: (Instrument) -> Void
    @AppStorage("menuMarket") private var pinned = Instrument.icbc.rawValue
    @AppStorage private var limit: Double

    init(market: Instrument, pin: @escaping (Instrument) -> Void, editLimit: @escaping (Instrument) -> Void) {
        self.market = market
        self.pin = pin
        self.editLimit = editLimit
        _limit = AppStorage(wrappedValue: 0, "limit." + market.rawValue)
    }

    var body: some View {
        HStack(spacing: 8) {
            Button { pin(market) } label: {
                Label(pinned == market.rawValue ? "菜单栏中" : "放入菜单栏", systemImage: "menubar.rectangle")
            }
            .tint(pinned == market.rawValue ? market.color : nil)
            Button { editLimit(market) } label: {
                Label(limit > 0 ? "≤ " + DisplayFormat.number(limit) : "价格提醒", systemImage: limit > 0 ? "bell.fill" : "bell")
            }
        }
        .controlSize(.small)
    }
}

private struct QuoteColumn: View {
    let market: Instrument
    let quote: MarketQuote?
    let state: String?

    private var status: String {
        switch state {
        case nil, "loading": "等待报价"
        case "stale": "报价过期"
        case "error", "cached": quote == nil ? "暂不可用" : "上次报价"
        case "market_closed": "休市报价"
        case "delayed": "官方延时"
        default: quote?.isFallback == true ? "备用行情源" : market == .icbc ? "官网参考价" : "现货行情"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(market.color).frame(width: 7, height: 7)
                Text(market.name).font(.headline)
                Spacer(minLength: 2)
                Text(status).font(.caption2).foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(quote.map { DisplayFormat.number($0.value) } ?? "—")
                    .font(.system(size: 33, weight: .medium, design: .rounded))
                    .monospacedDigit()
                Text(market.unit).font(.caption).foregroundStyle(.secondary)
            }
            .lineLimit(1).minimumScaleFactor(0.75)
            Text(detail).font(.caption).monospacedDigit()
            VStack(alignment: .leading, spacing: 3) {
                Text(sourceDetail)
                Text(timing)
            }
            .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .help(quote?.source ?? market.name)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        switch market {
        case .icbc:
            return "主动积存价 · 赎回 " + (quote?.redemption.map { DisplayFormat.number($0) } ?? "—")
        case .sge:
            guard let low = quote?.low, let high = quote?.high else { return "日内区间 —" }
            return "日内 " + DisplayFormat.number(low) + " – " + DisplayFormat.number(high)
        case .london:
            return "XAU/USD · " + (quote?.source ?? "国际现货")
        case .fx: return "USD/CNY"
        }
    }

    private var sourceDetail: String {
        guard let quote else { return "尚未收到报价" }
        if let published = quote.publishedAt { return "报价 " + DisplayFormat.dateTime.string(from: published) }
        return quote.tradeDate.map { "交易日 " + $0 } ?? quote.source
    }

    private var timing: String {
        guard let quote else { return "采集 —" }
        return "采集 " + DisplayFormat.dateTime.string(from: quote.observedAt)
    }
}

private struct PriceRange {
    let low, high: Double
    init(_ values: [Double]) {
        let floor = values.min() ?? 0, ceiling = values.max() ?? 1
        let padding = max((ceiling - floor) * 0.09, max(abs(ceiling) * 0.000025, 0.01))
        low = floor - padding
        high = ceiling + padding
    }
    func scaled(_ value: Double) -> Double { (value - low) / (high - low) }
    func inverse(_ fraction: Double) -> Double { low + fraction * (high - low) }
}

private struct PlotPoint: Identifiable {
    let time: Date
    let value: Double
    let market: Instrument
    let segment: Int
    let mark: Bool
    var id: String { market.rawValue + String(time.timeIntervalSinceReferenceDate) }
}

private struct PlotModel {
    let points: [PlotPoint]
    let mode: DisplayMode
    let start, end: Date
    let left, right: PriceRange
    let hasLeft, hasRight: Bool

    init(history: [Instrument: [PricePoint]], fx: Double?, end: Date, mode: DisplayMode) {
        self.mode = mode
        self.end = end
        let start = end.addingTimeInterval(-1800)
        self.start = start
        var points = [PlotPoint](), leftValues = [Double](), rightValues = [Double]()
        for market in Instrument.gold {
            if mode == .compare && market == .london && (fx ?? 0) <= 0 { continue }
            var byTime = [Date: Double]()
            for point in history[market] ?? [] where point.time >= start && point.time <= end && point.value.isFinite && point.value > 0 {
                byTime[point.time] = point.value
            }
            let rows = byTime.sorted { $0.key < $1.key }
            guard let base = rows.first?.value else { continue }
            var segment = 0
            for (index, row) in rows.enumerated() {
                let begins = index == 0 || row.key.timeIntervalSince(rows[index - 1].key) > 120
                if begins { segment += 1 }
                let last = index == rows.count - 1
                let isolated = begins && (last || rows[index + 1].key.timeIntervalSince(row.key) > 120)
                let value: Double = switch mode {
                case .index: row.value / base * 100
                case .compare where market == .london: row.value * (fx ?? 0) / 31.1034768
                default: row.value
                }
                points.append(PlotPoint(time: row.key, value: value, market: market, segment: segment, mark: last || isolated))
                if mode == .original && market == .london { rightValues.append(value) } else { leftValues.append(value) }
            }
        }
        self.points = points
        left = PriceRange(leftValues)
        right = PriceRange(rightValues)
        hasLeft = !leftValues.isEmpty
        hasRight = !rightValues.isEmpty
    }

    func y(_ point: PlotPoint) -> Double {
        (mode == .original && point.market == .london ? right : left).scaled(point.value)
    }

    func unit(for market: Instrument) -> String {
        switch mode {
        case .index: "指数"
        case .compare: "元/克"
        case .original: market.unit
        }
    }

    func nearest(to time: Date, market: Instrument) -> PlotPoint? {
        points.filter { $0.market == market && abs($0.time.timeIntervalSince(time)) <= 30 }
            .min { abs($0.time.timeIntervalSince(time)) < abs($1.time.timeIntervalSince(time)) }
    }
}

private struct CursorSummary: View {
    let model: PlotModel
    let cursor: Date?

    var body: some View {
        HStack(spacing: 16) {
            if let cursor, (model.start...model.end).contains(cursor) {
                Text("游标 " + DisplayFormat.clock.string(from: cursor)).fontWeight(.medium)
                ForEach(Instrument.gold, id: \.self) { market in
                    let point = model.nearest(to: cursor, market: market)
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 4) {
                            Circle().fill(market.color).frame(width: 5, height: 5)
                            Text(market.name)
                            Text(point.map { DisplayFormat.number($0.value) + " " + model.unit(for: market) } ?? "—")
                        }
                        Text(point.map { "样本 " + DisplayFormat.clock.string(from: $0.time) } ?? "此处无样本")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            } else {
                Image(systemName: "clock")
                Text("按报价时间绘制，缺失时使用采集时间。选中图表后可用 ← → 查看样本。")
            }
        }
        .font(.caption).monospacedDigit().foregroundStyle(.secondary)
        .frame(minHeight: 27, alignment: .leading).accessibilityElement(children: .combine)
    }
}

private struct NativePriceChart: View {
    let model: PlotModel
    @Binding var cursor: Date?
    @FocusState private var chartFocused: Bool
    private let ticks: [Double] = [0, 0.25, 0.5, 0.75, 1]

    private var plottedChart: some View {
        Chart {
            ForEach(model.points) { point in
                LineMark(x: .value("北京时间", point.time), y: .value("价格位置", model.y(point)),
                         series: .value("品种/连续区段", point.market.rawValue + String(point.segment)))
                    .foregroundStyle(point.market.color).lineStyle(StrokeStyle(lineWidth: 1.9, lineJoin: .round))
                if point.mark {
                    PointMark(x: .value("北京时间", point.time), y: .value("价格位置", model.y(point)))
                        .foregroundStyle(point.market.color).symbolSize(23)
                }
            }
            if let cursor, (model.start...model.end).contains(cursor) {
                RuleMark(x: .value("游标", cursor)).foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
        }
        .chartXScale(domain: model.start...model.end)
        .chartYScale(domain: 0.0...1.0)
        .chartLegend(.hidden)
        .chartXAxis {
            AxisMarks(values: .stride(by: .minute, count: 5)) { mark in
                AxisTick()
                AxisValueLabel {
                    if let date = mark.as(Date.self) { Text(DisplayFormat.axis.string(from: date)).monospacedDigit() }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: ticks) { mark in
                AxisGridLine().foregroundStyle(.quaternary)
                if model.hasLeft, let value = mark.as(Double.self) {
                    AxisValueLabel { Text(DisplayFormat.number(model.left.inverse(value))).monospacedDigit() }
                }
            }
            if model.mode == .original && model.hasRight {
                AxisMarks(position: .trailing, values: ticks) { mark in
                    if let value = mark.as(Double.self) {
                        AxisValueLabel { Text(DisplayFormat.number(model.right.inverse(value))).monospacedDigit() }
                    }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { chartFocused = true }
                    .onContinuousHover { phase in
                        guard let frame = proxy.plotFrame.map({ geo[$0] }),
                              case let .active(location) = phase, frame.contains(location), !model.points.isEmpty
                        else { cursor = nil; return }
                        cursor = proxy.value(atX: location.x - frame.minX, as: Date.self)
                    }
            }
        }
        .overlay {
            if model.points.isEmpty { Text("等待此时段的行情采样").font(.callout).foregroundStyle(.secondary) }
        }
    }

    private var spokenReading: String {
        let selection = cursor.flatMap { (model.start...model.end).contains($0) ? $0 : nil }
        let heading = selection.map { "游标，北京时间 " + DisplayFormat.dateTime.string(from: $0) } ?? "最新样本，北京时间"
        let readings = Instrument.gold.map { market in
            let point: PlotPoint?
            if let selection {
                point = model.nearest(to: selection, market: market)
            } else {
                point = model.points.last { $0.market == market }
            }
            guard let point else { return market.name + "，无样本" }
            return market.name + "，" + DisplayFormat.number(point.value) + " " + model.unit(for: market)
                + "，" + DisplayFormat.dateTime.string(from: point.time)
        }
        return ([heading] + readings).joined(separator: "。")
    }

    var body: some View {
        // Swift Charts' generated accessibility tree would read normalized drawing
        // coordinates for these dual axes. Expose one control with actual quotes.
        ZStack { plottedChart.accessibilityHidden(true) }
        .accessibilityElement(children: .ignore)
        .focusable()
        .focused($chartFocused)
        .onKeyPress(.leftArrow) { step(forward: false) }
        .onKeyPress(.rightArrow) { step(forward: true) }
        .onKeyPress(.escape) { cursor = nil; return .handled }
        .accessibilityLabel("近三十分钟黄金走势图，" + model.mode.rawValue)
        .accessibilityValue(Text(verbatim: spokenReading))
        .accessibilityHint("使用左右方向键查看各品种样本，按退出键清除游标。")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: _ = step(forward: true)
            case .decrement: _ = step(forward: false)
            @unknown default: break
            }
        }
    }

    private func step(forward: Bool) -> KeyPress.Result {
        let timeline = Set(model.points.map(\.time)).sorted()
        guard !timeline.isEmpty else { return .ignored }
        if forward {
            cursor = timeline.first { $0 > (cursor ?? .distantPast) } ?? timeline.last
        } else {
            cursor = timeline.last { $0 < (cursor ?? .distantFuture) } ?? timeline.first
        }
        return .handled
    }
}
