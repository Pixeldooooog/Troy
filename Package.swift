// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Troy",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Troy",
            path: "MacApp",
            exclude: ["Info.plist", "AppIcon.icns", "AppIcon.png"]
        ),
        .testTarget(name: "TroyTests", dependencies: ["Troy"])
    ]
)
