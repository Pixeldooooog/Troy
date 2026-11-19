#!/bin/zsh
set -eu
cd "${0:A:h:h}"
out=$PWD/dist-macos
bundle="$out/Troy.app"
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$bundle/Contents/Info.plist")
if [[ ${1:-} != "v$version" ]]; then
  print -u2 "Expected tag v$version to match Troy.app"
  exit 1
fi
codesign --verify --strict "$bundle"
architectures=$(xcrun lipo -archs "$bundle/Contents/MacOS/GoldMonitor")
for arch in arm64 x86_64; do
  [[ " $architectures " == *" $arch "* ]] || { print -u2 "Missing $arch"; exit 1; }
done
stage=$(mktemp -d "${TMPDIR:-/tmp}/troy-release.XXXXXX")
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/volume"
ditto "$bundle" "$stage/volume/Troy.app"
ln -s /Applications "$stage/volume/Applications"
name="Troy-$version-universal.dmg"
hdiutil create -quiet -volname Troy -srcfolder "$stage/volume" -format UDZO "$stage/$name"
hdiutil verify "$stage/$name"
(cd "$stage" && shasum -a 256 "$name" > "$name.sha256")
mv "$stage/$name" "$stage/$name.sha256" "$out/"
