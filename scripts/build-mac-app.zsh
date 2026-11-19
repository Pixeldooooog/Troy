#!/bin/zsh
set -eu
cd "${0:A:h:h}"
out=${1:-$PWD/dist-macos}
mkdir -p "$out"
out=${out:A}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/gold-macos.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
bundle="$scratch/Troy.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
for arch in arm64 x86_64; do
  xcrun --sdk macosx swiftc -O -swift-version 5 -target "${arch}-apple-macosx14.0" -parse-as-library \
    MacApp/*.swift -lsqlite3 -o "$scratch/GoldMonitor-$arch"
done
xcrun lipo -create "$scratch/GoldMonitor-arm64" "$scratch/GoldMonitor-x86_64" -output "$bundle/Contents/MacOS/GoldMonitor"
cp MacApp/Info.plist "$bundle/Contents/Info.plist"
cp MacApp/AppIcon.icns "$bundle/Contents/Resources/AppIcon.icns"
codesign --force --sign - --timestamp=none --options runtime "$bundle"
codesign --verify --strict "$bundle"
ditto "$bundle" "$out/Troy.app"
printf '%s\n' "$out/Troy.app"
