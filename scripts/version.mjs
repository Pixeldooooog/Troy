#!/usr/bin/env node
// Keeps the app version identical everywhere it is declared.
//   node scripts/version.mjs          check that all files agree (CI)
//   node scripts/version.mjs 2.1.0    set a new version everywhere
import { readFileSync, writeFileSync } from "node:fs";

const files = {
  "package.json": json(["version"]),
  "package-lock.json": json(["version"], ["packages", "", "version"]),
  "src-tauri/tauri.conf.json": json(["version"]),
  "src-tauri/Cargo.toml": toml(),
  "crates/troy-core/Cargo.toml": toml(),
  "Cargo.lock": lock(["troy-core", "troy-desktop"]),
};

function json(...paths) {
  return {
    read: (text) => paths.map((p) => p.reduce((o, k) => o?.[k], JSON.parse(text))),
    write: (text, v) => {
      const data = JSON.parse(text);
      for (const p of paths) p.slice(0, -1).reduce((o, k) => o[k], data)[p.at(-1)] = v;
      return JSON.stringify(data, null, 2) + "\n";
    },
  };
}
function toml() {
  const re = /^(\[package\][^[]*?\nversion = ")([^"]+)(")/m;
  return {
    read: (text) => [text.match(re)?.[2]],
    write: (text, v) => text.replace(re, `$1${v}$3`),
  };
}
function lock(names) {
  const re = (n) => new RegExp(`(\\[\\[package\\]\\]\\nname = "${n}"\\nversion = ")([^"]+)(")`);
  return {
    read: (text) => names.map((n) => text.match(re(n))?.[2]),
    write: (text, v) => names.reduce((t, n) => t.replace(re(n), `$1${v}$3`), text),
  };
}

const next = process.argv[2];
if (next) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    console.error(`Expected a version like 2.1.0, got "${next}"`);
    process.exit(1);
  }
  for (const [file, f] of Object.entries(files)) {
    writeFileSync(file, f.write(readFileSync(file, "utf8"), next));
  }
  console.log(`Set version ${next}. Tag the release as v${next}.`);
} else {
  const found = Object.entries(files).flatMap(([file, f]) =>
    f.read(readFileSync(file, "utf8")).map((v) => [file, v]),
  );
  const versions = new Set(found.map(([, v]) => v));
  if (versions.size !== 1 || versions.has(undefined)) {
    for (const [file, v] of found) console.error(`${file}: ${v}`);
    console.error("Versions disagree. Run: npm run version:set -- <x.y.z>");
    process.exit(1);
  }
  console.log(`All versions are ${[...versions][0]}.`);
}
