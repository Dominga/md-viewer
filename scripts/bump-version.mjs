#!/usr/bin/env node
/**
 * Set the project version everywhere it is declared:
 * `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
 *
 * Usage: node scripts/bump-version.mjs 0.2.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

function update(file, transform) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`${file}: already at ${version}`);
    return;
  }
  writeFileSync(path, after);
  console.log(`${file}: ${version}`);
}

update("package.json", (text) => {
  const data = JSON.parse(text);
  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
});

update("src-tauri/tauri.conf.json", (text) => {
  const data = JSON.parse(text);
  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
});

// The first standalone `version = "…"` line is the package version; dependency
// requirements are written inline and never match.
update("src-tauri/Cargo.toml", (text) =>
  text.replace(/^version = "[^"]*"$/m, `version = "${version}"`),
);
