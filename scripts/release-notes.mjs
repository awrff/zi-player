import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/release-notes.mjs <version>");
  process.exit(1);
}

const changelogPath = join(dirname(fileURLToPath(import.meta.url)), "../CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const start = changelog.search(new RegExp(`^## \\[${escaped}\\]`, "m"));
if (start < 0) {
  console.error(`No changelog section for ${version}`);
  process.exit(1);
}

const rest = changelog.slice(start);
const next = rest.slice(1).search(/^## \[/m);
const section = (next < 0 ? rest : rest.slice(0, next + 1)).trim();
process.stdout.write(`${section}\n`);
