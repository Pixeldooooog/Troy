// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Troy",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "Troy"),
        .testTarget(name: "TroyTests", dependencies: ["Troy"])
    ]
)
