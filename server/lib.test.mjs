import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSession,
  deleteFeedback,
  feedbackMail,
  openDb,
  parseFeedback,
  parsePing,
  recordFeedback,
  recordPing,
  saveFeedback,
  stats,
  verifySession,
} from "./lib.mjs";

const id = "11111111-1111-4111-8111-111111111111";

test("parsePing rejects a short version and accepts a normal ping", () => {
  assert.equal(parsePing({ id, v: "x".repeat(21), os: "windows" }), null);
  assert.deepEqual(parsePing({ id, v: "1.1.0", os: "linux" }), { id, v: "1.1.0", os: "linux" });
});

test("the same install on the same day is stored once", () => {
  const db = openDb(":memory:");
  const row = parsePing({ id, v: "1.1.0", os: "windows" });
  recordPing(db, row, "2026-11-12");
  recordPing(db, { ...row, v: "1.2.0" }, "2026-11-12");
  recordPing(db, row, "2026-11-13");
  const sameDay = db.prepare("SELECT COUNT(*) AS n FROM pings WHERE day = ?").get("2026-11-12");
  const installs = db.prepare("SELECT COUNT(DISTINCT install_id) AS n FROM pings").get();
  assert.equal(sameDay.n, 1);
  assert.equal(installs.n, 1);
});

test("feedback is stored and the mail payload carries the report", async () => {
  const db = openDb(":memory:");
  const row = parseFeedback({
    id,
    v: "1.1.0",
    os: "windows",
    kind: "bug",
    message: "播放没声音",
    contact: "a@b.c",
  });
  assert.ok(row);
  const sent = [];
  await saveFeedback(db, row, "2026-11-12T09:00:00.000Z", async (mail) => {
    sent.push(mail);
  });
  const stored = db.prepare("SELECT message, version FROM feedback").get();
  assert.equal(stored.message, "播放没声音");
  assert.equal(stored.version, "1.1.0");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "awrffxzc@gmail.com");
  assert.match(sent[0].subject, /Bug/);
  assert.match(sent[0].text, /播放没声音/);
  assert.match(sent[0].text, /1\.1\.0/);
  assert.match(sent[0].text, /windows/);
  assert.match(sent[0].text, new RegExp(id));
  assert.deepEqual(sent[0], feedbackMail({
    created_at: "2026-11-12T09:00:00.000Z",
    install_id: id,
    kind: "bug",
    message: "播放没声音",
    version: "1.1.0",
    os: "windows",
    contact: "a@b.c",
  }));
});

test("a mail failure still keeps the feedback row", async () => {
  const db = openDb(":memory:");
  const row = parseFeedback({ id, v: "1.1.0", os: "linux", kind: "feature", message: "要歌词" });
  await saveFeedback(db, row, "2026-11-12T09:00:00.000Z", async () => {
    throw new Error("smtp down");
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM feedback").get().n, 1);
});

test("version and os follow each install's latest ping", () => {
  const db = openDb(":memory:");
  const other = "22222222-2222-4222-8222-222222222222";
  recordPing(db, { id, v: "1.0.0", os: "windows" }, "2026-11-01");
  recordPing(db, { id, v: "1.2.0", os: "linux" }, "2026-11-12");
  recordPing(db, { id: other, v: "1.2.0", os: "windows" }, "2026-11-10");
  const data = stats(db, "2026-11-12", ["2026-11-01", "2026-11-12"]);
  assert.deepEqual(data.byVersion, [{ label: "1.2.0", n: 2 }]);
  assert.deepEqual(data.byOs, [
    { label: "linux", n: 1 },
    { label: "windows", n: 1 },
  ]);
});

test("deleteFeedback removes only the chosen row", () => {
  const db = openDb(":memory:");
  const kept = recordFeedback(db, parseFeedback({ id, v: "1.1.0", os: "windows", kind: "bug", message: "留下" }), "2026-11-12T00:00:00.000Z");
  const gone = recordFeedback(db, parseFeedback({ id, v: "1.1.0", os: "windows", kind: "feature", message: "删掉" }), "2026-11-12T01:00:00.000Z");
  assert.equal(deleteFeedback(db, gone.id), 1);
  assert.equal(deleteFeedback(db, gone.id), 0);
  assert.equal(db.prepare("SELECT message FROM feedback").get().message, kept.message);
});

test("sessions require the zi prefix", () => {
  const secret = "s".repeat(32);
  const token = createSession(secret, 1_700_000_000_000);
  assert.equal(verifySession(token, secret, 1_700_000_000_000), true);
  assert.equal(verifySession(token.slice(3), secret, 1_700_000_000_000), false);
});
