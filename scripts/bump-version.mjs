#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: npm run version:bump -- <semver>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

function rewrite(rel, replacer) {
  const path = resolve(root, rel);
  writeFileSync(path, replacer(readFileSync(path, "utf8")));
}

rewrite("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
rewrite("package-lock.json", (s) => {
  const json = JSON.parse(s);
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  return `${JSON.stringify(json, null, 2)}\n`;
});
rewrite("src-tauri/tauri.conf.json", (s) =>
  s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`),
);
rewrite("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));
rewrite("src-tauri/Cargo.lock", (s) =>
  s.replace(/name = "zi-player"\nversion = "[^"]+"/, `name = "zi-player"\nversion = "${version}"`),
);

console.log(`bumped version to ${version}`);
