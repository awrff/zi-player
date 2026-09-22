#!/usr/bin/env node

import { execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const raw = readFileSync(resolve(root, "VERSION"), "utf8").trim();
if (!/^\d+\.\d+$/.test(raw)) {
  console.error(`VERSION must be X.Y, got: ${raw}`);
  process.exit(1);
}

const [maj, min] = raw.split(".").map(Number);
const sha = process.env.GITHUB_SHA ?? "";
const branch = process.env.GITHUB_REF_NAME ?? "";

if (branch && branch !== "master" && branch !== "develop") {
  console.error(`Release only runs on master or develop, got: ${branch}`);
  process.exit(1);
}

const prerelease = branch === "develop";

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", cwd: root }).trim();
}

function parseOfficial(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), tag };
}

function parseRc(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/.exec(tag);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    rc: Number(m[4]),
    tag,
  };
}

function cmp(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function xyLess(aMaj, aMin, bMaj, bMin) {
  return aMaj < bMaj || (aMaj === bMaj && aMin < bMin);
}

function releaseFromSubject(subject) {
  const m = /^chore: release (\d+\.\d+\.\d+(?:-rc\.\d+)?)$/.exec(subject);
  return m ? m[1] : null;
}

function findReuseVersion() {
  const headRelease = releaseFromSubject(git("log -1 --format=%s"));
  if (headRelease) return headRelease;
  if (!sha || !branch) return null;

  let log = "";
  try {
    log = git(`log origin/${branch} --format=%H%x09%P%x09%s`);
  } catch {
    return null;
  }

  for (const line of log.split(/\r?\n/)) {
    if (!line) continue;
    const [, parents, subject] = line.split("\t");
    const version = releaseFromSubject(subject ?? "");
    if (version && (parents ?? "").split(" ").includes(sha)) {
      return version;
    }
  }
  return null;
}

const allTags = git('tag -l "v*"').split(/\r?\n/).filter(Boolean);
const official = allTags.map(parseOfficial).filter(Boolean).sort(cmp);
const rcs = allTags.map(parseRc).filter(Boolean);
const latest = official.at(-1);

if (latest && xyLess(maj, min, latest.major, latest.minor)) {
  console.error(`VERSION ${raw} is lower than published ${latest.major}.${latest.minor}`);
  process.exit(1);
}

function nextOfficial() {
  if (!latest) return `${maj}.${min}.0`;
  if (maj === latest.major && min === latest.minor) {
    return `${maj}.${min}.${latest.patch + 1}`;
  }
  return `${maj}.${min}.0`;
}

function nextRc(base) {
  const [bMaj, bMin, bPatch] = base.split(".").map(Number);
  const n = rcs
    .filter((t) => t.major === bMaj && t.minor === bMin && t.patch === bPatch)
    .reduce((max, t) => Math.max(max, t.rc), 0);
  return `${base}-rc.${n + 1}`;
}

const reused = findReuseVersion();
let version;
let shouldBump;
if (reused) {
  version = reused;
  shouldBump = false;
} else {
  const officialNext = nextOfficial();
  version = prerelease ? nextRc(officialNext) : officialNext;
  shouldBump = true;
}

const tag = `v${version}`;
if (shouldBump && allTags.includes(tag)) {
  shouldBump = false;
}

const lines = [
  `version=${version}`,
  `tag=${tag}`,
  `should_bump=${shouldBump}`,
  `prerelease=${prerelease}`,
];

console.log(lines.join("\n"));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
