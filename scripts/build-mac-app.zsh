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
build_args=(--configuration release --arch arm64 --arch x86_64 --scratch-path "$scratch/build")
swift build "${build_args[@]}" --product Troy
bin_dir=$(swift build "${build_args[@]}" --show-bin-path)
cp "$bin_dir/Troy" "$bundle/Contents/MacOS/GoldMonitor"
cp Packaging/macOS/Info.plist "$bundle/Contents/Info.plist"
cp Packaging/macOS/AppIcon.icns "$bundle/Contents/Resources/AppIcon.icns"
codesign --force --sign - --timestamp=none --options runtime "$bundle"
codesign --verify --strict "$bundle"
ditto "$bundle" "$out/Troy.app"
printf '%s\n' "$out/Troy.app"
