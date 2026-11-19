import Foundation
import CryptoKit
import SQLite3

private struct StoreError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

private enum SQLValue {
    case text(String), number(Double), integer(Int64), blob(Data)
}

private final class Database {
    let handle: OpaquePointer

    init(_ file: URL, readOnly: Bool = false, immutable: Bool = false) throws {
        var pointer: OpaquePointer?
        let flags = readOnly ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
        let filename = immutable ? file.absoluteString + "?immutable=1" : file.path
        let result = sqlite3_open_v2(filename, &pointer, flags | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_URI, nil)
        guard result == SQLITE_OK, let pointer else {
            let reason = pointer.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite \(result)"
            if let pointer { sqlite3_close(pointer) }
            throw StoreError(reason)
        }
        handle = pointer
        sqlite3_busy_timeout(handle, 5000)
    }

    deinit { sqlite3_close_v2(handle) }

    func run(_ sql: String) throws {
        guard sqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else { throw error() }
    }

    func error() -> StoreError { StoreError(String(cString: sqlite3_errmsg(handle))) }

    func transaction<T>(_ body: () throws -> T) throws -> T {
        try run("BEGIN IMMEDIATE")
        do {
            let result = try body()
            try run("COMMIT")
            return result
        } catch {
            try? run("ROLLBACK")
            throw error
        }
    }

    func statement(_ sql: String, _ arguments: [SQLValue] = []) throws -> Statement {
        try Statement(self, sql, arguments)
    }
}

private final class Statement {
    let db: Database
    let handle: OpaquePointer

    init(_ db: Database, _ sql: String, _ arguments: [SQLValue]) throws {
        self.db = db
        var pointer: OpaquePointer?
        guard sqlite3_prepare_v2(db.handle, sql, -1, &pointer, nil) == SQLITE_OK, let pointer else {
            throw db.error()
        }
        handle = pointer
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (offset, argument) in arguments.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch argument {
            case .text(let value): result = sqlite3_bind_text(pointer, index, value, -1, transient)
            case .number(let value): result = sqlite3_bind_double(pointer, index, value)
            case .integer(let value): result = sqlite3_bind_int64(pointer, index, value)
            case .blob(let data):
                result = data.withUnsafeBytes {
                    sqlite3_bind_blob(pointer, index, $0.baseAddress, Int32($0.count), transient)
                }
            }
            guard result == SQLITE_OK else { throw db.error() }
        }
    }
    deinit { sqlite3_finalize(handle) }

    @discardableResult
    func step() throws -> Bool {
        switch sqlite3_step(handle) {
        case SQLITE_ROW: return true
        case SQLITE_DONE: return false
        default: throw db.error()
        }
    }
    func text(_ index: Int32) -> String? { sqlite3_column_text(handle, index).map { String(cString: $0) } }
    func number(_ index: Int32) -> Double { sqlite3_column_double(handle, index) }
    func integer(_ index: Int32) -> Int64 { sqlite3_column_int64(handle, index) }
    func quote(_ index: Int32) throws -> MarketQuote {
        guard let bytes = sqlite3_column_blob(handle, index) else { throw StoreError("缺少报价记录") }
        return try JSONDecoder().decode(MarketQuote.self, from: Data(bytes: bytes, count: Int(sqlite3_column_bytes(handle, index))))
    }
}

final class QuoteStore: @unchecked Sendable {
    let directory: URL
    private let db: Database
    private let lock = NSLock()
    private let encoder = JSONEncoder()

    init(directory: URL? = nil) throws {
        let defaultDirectory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                           appropriateFor: nil, create: true)
        self.directory = directory ?? defaultDirectory.appendingPathComponent("local.goldmonitor.desktop", isDirectory: true)
        try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
        db = try Database(self.directory.appendingPathComponent("quotes.sqlite3"))
        try db.run("""
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS samples (
                id INTEGER PRIMARY KEY, instrument TEXT NOT NULL, chart_at REAL NOT NULL, observed_at REAL NOT NULL,
                value REAL NOT NULL, origin TEXT NOT NULL, plottable INTEGER NOT NULL, payload BLOB NOT NULL,
                UNIQUE(instrument, chart_at, origin)
            );
            CREATE INDEX IF NOT EXISTS samples_timeline ON samples(chart_at) WHERE plottable=1;
            CREATE INDEX IF NOT EXISTS samples_observed ON samples(instrument, observed_at DESC, id DESC);
            CREATE TABLE IF NOT EXISTS latest (instrument TEXT PRIMARY KEY, observed_at REAL NOT NULL, payload BLOB NOT NULL);
            """)
    }

    func latest() throws -> [Instrument: MarketQuote] {
        try lock.withLock {
            let query = try db.statement("SELECT payload FROM latest")
            var records: [Instrument: MarketQuote] = [:]
            while try query.step() {
                let quote = try query.quote(0)
                records[quote.instrument] = quote
            }
            return records
        }
    }

    func history(since: Date) throws -> [Instrument: [PricePoint]] {
        try lock.withLock {
            let query = try db.statement("""
                SELECT instrument, chart_at, value FROM samples
                WHERE plottable=1 AND chart_at BETWEEN ? AND ?
                ORDER BY chart_at, observed_at, id
                """, [.number(since.timeIntervalSince1970), .number(Date().timeIntervalSince1970)])
            var histories: [Instrument: [PricePoint]] = [:]
            while try query.step() {
                guard let key = query.text(0).flatMap(Instrument.init(rawValue:)) else { continue }
                let point = PricePoint(time: Date(timeIntervalSince1970: query.number(1)), value: query.number(2))
                if histories[key]?.last?.time == point.time { histories[key]?.removeLast() }
                histories[key, default: []].append(point)
            }
            return histories
        }
    }

    func save(_ quote: MarketQuote) throws {
        guard quote.value.isFinite, quote.value > 0 else { throw StoreError("无效的行情价格") }
        try lock.withLock {
            try db.transaction {
                let data = try encoder.encode(quote)
                try updateLatest(quote, data: data)
                let lookup = try db.statement("""
                    SELECT payload FROM samples WHERE instrument=? ORDER BY observed_at DESC, id DESC LIMIT 1
                    """, [.text(quote.instrument.rawValue)])
                if try lookup.step(), !needsSample(quote, after: try lookup.quote(0)) { return }
                try addSample(quote, data: data, origin: "native", plottable: quote.isCurrent(at: quote.observedAt), replace: true)
            }
        }
    }

    private func needsSample(_ quote: MarketQuote, after last: MarketQuote) -> Bool {
        if quote.value != last.value || quote.publishedAt != last.publishedAt || quote.source != last.source ||
            quote.redemption != last.redemption || quote.high != last.high || quote.low != last.low ||
            quote.tradeDate != last.tradeDate || quote.isFallback != last.isFallback ||
            quote.isDailyReference != last.isDailyReference { return true }
        return quote.publishedAt == nil && quote.isCurrent(at: quote.observedAt) &&
            quote.observedAt.timeIntervalSince(last.observedAt) >= 60
    }

    private func updateLatest(_ quote: MarketQuote, data: Data) throws {
        try db.statement("""
            INSERT INTO latest(instrument,observed_at,payload) VALUES(?,?,?)
            ON CONFLICT(instrument) DO UPDATE SET observed_at=excluded.observed_at,payload=excluded.payload
            WHERE excluded.observed_at>=latest.observed_at
            """, [.text(quote.instrument.rawValue), .number(quote.observedAt.timeIntervalSince1970), .blob(data)]).step()
    }

    private func addSample(_ quote: MarketQuote, data: Data, origin: String, plottable: Bool, replace: Bool) throws {
        let chartAt = (quote.publishedAt ?? quote.observedAt).timeIntervalSince1970
        let onConflict = replace ? """
            DO UPDATE SET value=excluded.value,observed_at=excluded.observed_at,payload=excluded.payload,plottable=excluded.plottable
            WHERE excluded.observed_at>=samples.observed_at
            """ : "DO NOTHING"
        try db.statement("""
            INSERT INTO samples(instrument,chart_at,observed_at,value,origin,plottable,payload) VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(instrument,chart_at,origin) \(onConflict)
            """, [.text(quote.instrument.rawValue), .number(chartAt), .number(quote.observedAt.timeIntervalSince1970),
                  .number(quote.value), .text(origin), .integer(plottable ? 1 : 0), .blob(data)]).step()
    }

    // SQLite's backup API takes a consistent snapshot including committed WAL frames. The archive
    // preserves earlier schemas and rows whose product side or timestamp cannot be reconstructed.
    @discardableResult
    func importLegacy(from source: URL) throws -> Int {
        try lock.withLock {
            let archives = directory.appendingPathComponent("Legacy", isDirectory: true)
            try FileManager.default.createDirectory(at: archives, withIntermediateDirectories: true)
            let stage = archives.appendingPathComponent(".import-\(UUID().uuidString).sqlite3")
            defer {
                // The first backup attempt can create temporary WAL sidecars.
                for suffix in ["", "-wal", "-shm", "-journal"] {
                    try? FileManager.default.removeItem(atPath: stage.path + suffix)
                }
            }
            try backup(source: source, to: stage)
            let imported = try importArchive(stage)
            let fingerprint = SHA256.hash(data: Data(source.standardizedFileURL.path.utf8)).prefix(8)
                .map { String(format: "%02x", $0) }.joined()
            let archive = archives.appendingPathComponent("gold-monitor-\(fingerprint).sqlite3")
            // Rename on the same volume replaces the prior consistent snapshot atomically.
            guard rename(stage.path, archive.path) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
            return imported
        }
    }

    private func backup(source: URL, to destination: URL) throws {
        do {
            try copyDatabase(source, to: destination, immutable: false)
        } catch {
            // A closed WAL-format file on macOS may reject a read-only connection if
            // its sidecars are absent. Never use immutable mode on a live WAL.
            guard let version = try offlineVersion(of: source) else { throw error }
            try FileManager.default.removeItem(at: destination)
            try copyDatabase(source, to: destination, immutable: true)
            guard try offlineVersion(of: source) == version else {
                throw StoreError("导入期间旧数据库发生变化，请重新导入")
            }
        }
    }

    private func offlineVersion(of file: URL) throws -> String? {
        guard !["-wal", "-shm", "-journal"].contains(where: { FileManager.default.fileExists(atPath: file.path + $0) }) else { return nil }
        let attrs = try FileManager.default.attributesOfItem(atPath: file.path)
        guard let inode = attrs[.systemFileNumber] as? NSNumber, let size = attrs[.size] as? NSNumber,
              let updated = attrs[.modificationDate] as? Date else { return nil }
        return "\(inode):\(size):\(updated.timeIntervalSince1970)"
    }

    private func copyDatabase(_ source: URL, to destination: URL, immutable: Bool) throws {
        let old = try Database(source, readOnly: true, immutable: immutable)
        let copy = try Database(destination)
        guard let snapshot = sqlite3_backup_init(copy.handle, "main", old.handle, "main") else { throw copy.error() }
        let deadline = Date().addingTimeInterval(10)
        var result: Int32
        repeat {
            result = sqlite3_backup_step(snapshot, 256)
            if result == SQLITE_BUSY || result == SQLITE_LOCKED { sqlite3_sleep(20) }
        } while [SQLITE_OK, SQLITE_BUSY, SQLITE_LOCKED].contains(result) && Date() < deadline
        let ended = sqlite3_backup_finish(snapshot)
        guard result == SQLITE_DONE, ended == SQLITE_OK else { throw StoreError("旧行情数据库复制失败 (SQLite \(result), \(ended))") }
        // A self-contained archive should not depend on sidecar files after rename.
        try copy.run("PRAGMA journal_mode=DELETE")
    }

    private func importArchive(_ file: URL) throws -> Int {
        let archive = try Database(file, readOnly: true)
        let rows = try archive.statement("""
            SELECT id,instrument_key,value,source_name,source_type,observed_at,published_at,
                   metadata_json,status,is_fallback FROM quote_snapshots ORDER BY id
            """)
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        func parseDate(_ text: String?) -> Date? {
            text.flatMap { withFraction.date(from: $0) ?? plain.date(from: $0) }
        }
        return try db.transaction {
            var inserted = 0
            while try rows.step() {
                guard let key = rows.text(1).flatMap(Instrument.init(rawValue:)),
                      let source = rows.text(3), let observed = parseDate(rows.text(5)) else { continue }
                let value = rows.number(2)
                guard value.isFinite, value > 0 else { continue }
                let json = Data((rows.text(7) ?? "{}").utf8)
                let metadata = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any] ?? [:]
                let sourceType = rows.text(4)
                var quote = MarketQuote(instrument: key, value: value, source: source, observedAt: observed)
                quote.tradeDate = metadata["tradeDate"] as? String
                quote.redemption = metadata["sellPrice"] as? Double
                quote.high = metadata["high"] as? Double
                quote.low = metadata["low"] as? Double
                quote.isFallback = rows.integer(9) != 0
                quote.isDailyReference = sourceType == "third_party_reference" || source == "ER API USD/CNY"
                // These retired adapters stamped the query time as the publisher's time.
                let knownObservationOnly = ["Gold API live", "ER API USD/CNY", "ICBC accumulated gold page"].contains(source)
                let oldDateOnly = key == .sge && source == "SGE delayed page" && rows.text(6)?.contains("T00:00:00") == true
                if oldDateOnly { quote.tradeDate = rows.text(6).map { String($0.prefix(10)) } }
                if !knownObservationOnly && !oldDateOnly { quote.publishedAt = parseDate(rows.text(6)) }
                let trustworthyProduct = key != .icbc || (sourceType == "official" && quote.tradeDate != nil)
                let usable = trustworthyProduct && !["stale", "error", "market_closed"].contains(rows.text(8) ?? "") && sourceType != "cache"
                let data = try encoder.encode(quote)
                let origin = "legacy:\(rows.integer(0)):\(observed.timeIntervalSince1970):\(value):\(source)"
                try addSample(quote, data: data, origin: origin, plottable: usable, replace: false)
                inserted += Int(sqlite3_changes(db.handle))
                if trustworthyProduct { try updateLatest(quote, data: data) }
            }
            return inserted
        }
    }
}
