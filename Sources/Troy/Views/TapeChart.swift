import SwiftUI
import Charts

struct TapeChart: View {
    let history: [Instrument: [PricePoint]]
    @Environment(\.displayScale) private var displayScale
    @AppStorage("tapeMarket") private var market: Instrument = .london
    @AppStorage("tapeMinutes") private var minutes = 1
    @State private var selected: Date?
    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = MarketQuote.beijing
        f.dateFormat = "HH:mm"
        return f
    }()
    private func number(_ n: Double) -> String { String(format: "%.2f", n) }
    private func ink(_ bar: QuoteCandle) -> Color {
        if bar.close == bar.open { return .secondary }
        return bar.close > bar.open ? Color(red: 0.76, green: 0.24, blue: 0.23) : Color(red: 0.02, green: 0.49, blue: 0.40)
    }

    var body: some View {
        let step = minutes == 5 ? 300 : 60
        let now = Date()
        let end = Date(timeIntervalSince1970: Double((Int(now.timeIntervalSince1970) / step + 1) * step))
        let start = end.addingTimeInterval(-1800)
        let bars = QuoteCandle.aggregate(history[market] ?? [], seconds: step, start: start, end: now)
        let last = bars.last
        let slot = selected.map { Int($0.timeIntervalSince1970) / step }
        let reading = selected == nil ? last : bars.first { Int($0.id.timeIntervalSince1970) / step == slot }
        let low = bars.map(\.low).min() ?? 0
        let high = bars.map(\.high).max() ?? 1
        let pad = max((high-low)*0.18, 0.06)
        let hairline = 1 / max(1, displayScale)
        let bodyWidth: CGFloat = step == 60 ? 8 : 14
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Picker("品种", selection: $market) {
                    ForEach(Instrument.gold, id: \.self) { Text($0.name).tag($0) }
                }.labelsHidden().fixedSize()
                Picker("周期", selection: $minutes) {
                    Text("1 分").tag(1)
                    Text("5 分").tag(5)
                }.pickerStyle(.segmented).labelsHidden().fixedSize()
                Spacer()
                Text(market.unit + (market == .sge ? " · 官方延时" : "")).foregroundStyle(.secondary)
            }
            HStack(spacing: 14) {
                Text(reading.map { Self.clock.string(from: $0.id) } ?? "—")
                ForEach(["开", "高", "低", "收"], id: \.self) { label in
                    let value = reading.map { b in label == "开" ? b.open : label == "高" ? b.high : label == "低" ? b.low : b.close }
                    HStack(spacing: 4) {
                        Text(label).foregroundStyle(.secondary)
                        Text(value.map(number) ?? "—").fontWeight(label == "收" ? .semibold : .regular)
                    }
                }
                Spacer()
                Text("\(reading?.count ?? 0) 笔采样").foregroundStyle(.secondary)
            }.font(.system(.caption, design: .monospaced))
            Chart {
                ForEach(bars) { b in
                    let x = b.id.addingTimeInterval(Double(step)/2)
                    RuleMark(x: .value("周期", x), yStart: .value("低", b.low), yEnd: .value("高", b.high))
                        .foregroundStyle(ink(b)).lineStyle(.init(lineWidth: max(hairline, 0.8)))
                    if b.open == b.close {
                        PointMark(x: .value("周期", x), y: .value("平", b.close))
                            .symbol { Rectangle().fill(ink(b)).frame(width: bodyWidth, height: max(hairline, 1)) }
                    } else {
                        RectangleMark(x: .value("周期", x), yStart: .value("开收低", min(b.open,b.close)),
                                      yEnd: .value("开收高", max(b.open,b.close)), width: .fixed(bodyWidth))
                            .foregroundStyle(ink(b))
                    }
                }
                if let last {
                    RuleMark(y: .value("末价", last.close)).lineStyle(.init(lineWidth: 0.8, dash: [3,3])).foregroundStyle(.secondary)
                }
                if let selected, selected >= start && selected <= end {
                    RuleMark(x: .value("游标", selected)).lineStyle(.init(lineWidth: 0.7, dash: [3,3])).foregroundStyle(.secondary)
                }
            }
            .chartXScale(domain: start...end).chartYScale(domain: (low-pad)...(high+pad))
            .chartXAxis {
                AxisMarks(values: .stride(by: .minute, count: 5)) { mark in
                    AxisTick(length: 3, stroke: .init(lineWidth: hairline))
                    AxisValueLabel { if let d = mark.as(Date.self) { Text(Self.clock.string(from:d)).font(.system(size: 10, design: .monospaced)) } }
                }
            }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 5)) { mark in
                AxisGridLine(stroke: .init(lineWidth: hairline)).foregroundStyle(Color.secondary.opacity(0.23))
                AxisValueLabel { if let v = mark.as(Double.self) { Text(number(v)).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary) } }
            } }
            .chartOverlay { proxy in GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle()).onContinuousHover { phase in
                    guard case let .active(p) = phase, let rect = proxy.plotFrame.map({ geo[$0] }), rect.contains(p) else { selected = nil; return }
                    selected = proxy.value(atX: p.x-rect.minX, as: Date.self)
                }
            }}
            .focusable().onKeyPress(.leftArrow) {
                selected = bars.last { $0.id < (selected ?? .distantFuture) }?.id ?? bars.first?.id
                return .handled
            }.onKeyPress(.rightArrow) {
                selected = bars.first { $0.id > (selected ?? .distantPast) }?.id ?? bars.last?.id
                return .handled
            }.onKeyPress(.escape) { selected = nil; return .handled }
            .overlay { if bars.isEmpty { Text("等待本时段报价").foregroundStyle(.secondary) } }
            .frame(minHeight: 145)
            Text("采样 K 线 · 红涨绿跌 · 单笔报价显示为横杠 · 空白时段无采样").font(.caption2).foregroundStyle(.secondary)
        }.onChange(of: market) { selected = nil }.onChange(of: minutes) { selected = nil }
    }
}
