import Foundation

struct QuoteCandle: Identifiable {
    let id: Date
    let open, high, low, close: Double
    let count: Int

    static func aggregate(_ points: [PricePoint], seconds: Int, start: Date, end: Date) -> [Self] {
        var unique = [Date: Double]()
        for p in points where p.time >= start && p.time <= end && p.value.isFinite && p.value > 0 {
            unique[p.time] = p.value
        }
        let groups = Dictionary(grouping: unique.keys) { Int($0.timeIntervalSince1970) / seconds }
        return groups.keys.sorted().compactMap { k in
            let values = groups[k]!.sorted().compactMap { unique[$0] }
            guard let o = values.first, let c = values.last else { return nil }
            return Self(id: Date(timeIntervalSince1970: Double(k * seconds)), open: o, high: values.max()!,
                        low: values.min()!, close: c, count: values.count)
        }
    }
}
