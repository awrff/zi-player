import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OS = new Set(["windows", "linux", "other"]);
export const MAIL_TO = "awrffxzc@gmail.com";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function shanghaiDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function lastDays(count, now) {
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    days.push(shanghaiDay(new Date(now.getTime() - i * 86400000)));
  }
  return days;
}

function field(body, key) {
  return body && typeof body[key] === "string" ? body[key].trim() : "";
}

export function parsePing(body) {
  const id = field(body, "id");
  const v = field(body, "v");
  const os = field(body, "os");
  if (!UUID.test(id) || !v || v.length > 20 || !OS.has(os)) return null;
  return { id, v, os };
}

export function parseFeedback(body) {
  const id = field(body, "id");
  const v = field(body, "v");
  const os = field(body, "os");
  const kind = field(body, "kind");
  const message = field(body, "message");
  const contact = field(body, "contact");
  if (!UUID.test(id) || !v || v.length > 20 || !OS.has(os)) return null;
  if (kind !== "bug" && kind !== "feature") return null;
  if (!message || message.length > 2000 || contact.length > 200) return null;
  return { id, v, os, kind, message, contact };
}

export function openDb(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pings (
      install_id TEXT NOT NULL,
      day TEXT NOT NULL,
      version TEXT,
      os TEXT,
      PRIMARY KEY (install_id, day)
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      install_id TEXT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      version TEXT,
      os TEXT,
      contact TEXT
    );
  `);
  return db;
}

export function recordPing(db, row, day) {
  db.prepare("INSERT OR IGNORE INTO pings (install_id, day, version, os) VALUES (?, ?, ?, ?)").run(
    row.id,
    day,
    row.v,
    row.os,
  );
}

export function feedbackMail(row) {
  const label = row.kind === "bug" ? "Bug" : "需求";
  return {
    to: MAIL_TO,
    subject: `[ZI Player] ${label}`,
    text: [
      `时间: ${row.created_at}`,
      `版本: ${row.version}`,
      `系统: ${row.os}`,
      `安装编号: ${row.install_id}`,
      `联系方式: ${row.contact || "无"}`,
      "",
      row.message,
    ].join("\n"),
  };
}

export function recordFeedback(db, row, createdAt) {
  const info = db
    .prepare(
      "INSERT INTO feedback (created_at, install_id, kind, message, version, os, contact) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(createdAt, row.id, row.kind, row.message, row.v, row.os, row.contact);
  return {
    id: Number(info.lastInsertRowid),
    created_at: createdAt,
    install_id: row.id,
    kind: row.kind,
    message: row.message,
    version: row.v,
    os: row.os,
    contact: row.contact,
  };
}

export async function saveFeedback(db, row, createdAt, send) {
  const saved = recordFeedback(db, row, createdAt);
  try {
    await send(feedbackMail(saved));
  } catch (err) {
    console.error("feedback mail failed", err);
  }
  return saved;
}

function latestBreakdown(db, column) {
  const rows = db
    .prepare(
      `SELECT ${column} AS label, COUNT(*) AS n
       FROM pings AS p
       WHERE day = (SELECT MAX(day) FROM pings WHERE install_id = p.install_id)
       GROUP BY ${column}`,
    )
    .all();
  return rows
    .map((row) => ({ label: row.label || "未知", n: Number(row.n) }))
    .sort((a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label)));
}

export function stats(db, today, days) {
  const total = Number(db.prepare("SELECT COUNT(DISTINCT install_id) AS n FROM pings").get().n);
  const todayCount = Number(db.prepare("SELECT COUNT(*) AS n FROM pings WHERE day = ?").get(today).n);
  const rows = db.prepare("SELECT day, COUNT(*) AS n FROM pings WHERE day >= ? GROUP BY day").all(days[0]);
  const byDay = new Map(rows.map((row) => [row.day, Number(row.n)]));
  return {
    total,
    today: todayCount,
    series: days.map((day) => ({ day, n: byDay.get(day) ?? 0 })),
    byVersion: latestBreakdown(db, "version"),
    byOs: latestBreakdown(db, "os"),
    feedback: db
      .prepare(
        "SELECT id, created_at, kind, version, message, contact FROM feedback ORDER BY id DESC LIMIT 50",
      )
      .all(),
  };
}

export function deleteFeedback(db, id) {
  return db.prepare("DELETE FROM feedback WHERE id = ?").run(id).changes;
}

export function passwordsMatch(given, expected) {
  if (!expected || expected.length < 8 || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(secret, now = Date.now()) {
  const payload = `zi.${now + SESSION_TTL_MS}.${randomBytes(16).toString("hex")}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== "string" || !token.startsWith("zi.")) return false;
  const last = token.lastIndexOf(".");
  if (last <= 0) return false;
  const payload = token.slice(0, last);
  const sig = token.slice(last + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (sig.length !== expected.length) return false;
  const expires = Number(payload.split(".")[1]);
  if (!Number.isFinite(expires) || expires < now) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ponytail: one process, counters reset on restart. Bump the cap if a shared NAT starts seeing 429s.
export function createLimiter(limit, windowMs) {
  const hits = new Map();
  function entry(ip, now) {
    const current = hits.get(ip);
    if (!current || current.resetAt <= now) {
      const fresh = { count: 0, resetAt: now + windowMs };
      hits.set(ip, fresh);
      if (hits.size > 1000) {
        for (const [key, value] of hits) {
          if (value.resetAt <= now) hits.delete(key);
        }
      }
      return fresh;
    }
    return current;
  }
  return {
    over(ip, now = Date.now()) {
      const current = hits.get(ip);
      return !!current && current.resetAt > now && current.count >= limit;
    },
    add(ip, now = Date.now()) {
      const current = entry(ip, now);
      current.count += 1;
      return current.count <= limit;
    },
  };
}

export function clientIp(header, fallback = "unknown") {
  if (!header) return fallback;
  const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || fallback;
}
