// pm2 cwd: /srv/zi-player-api. Listens on 127.0.0.1:4322.
// Password comes from the portfolio .env. SMTP comes from this directory's .env.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import nodemailer from "nodemailer";
import {
  clientIp,
  createLimiter,
  createSession,
  deleteFeedback,
  lastDays,
  openDb,
  parseEnv,
  parseFeedback,
  parsePing,
  passwordsMatch,
  recordPing,
  saveFeedback,
  shanghaiDay,
  stats,
  verifySession,
} from "./lib.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4322);
const DB_FILE = process.env.ZI_DB || join(process.cwd(), "data", "zi.sqlite");
const ADMIN_ENV = process.env.ZI_ADMIN_ENV || "/www/wwwroot/portfolio-site/.env";
const SMTP_ENV = process.env.ZI_SMTP_ENV || join(process.cwd(), ".env");
const COOKIE = "zi_session";

function readEnvFile(file) {
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function loadAuth() {
  const env = readEnvFile(ADMIN_ENV);
  return {
    password: env.ADMIN_PASSWORD ?? "",
    secret: env.AUTH_SECRET ?? "",
  };
}

function loadSmtp() {
  const env = { ...readEnvFile(SMTP_ENV), ...process.env };
  const port = Number(env.SMTP_PORT || 465);
  return {
    host: env.SMTP_HOST || "",
    port,
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.MAIL_FROM || "",
  };
}

function makeSender(smtp) {
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    return async () => {
      console.error("feedback mail skipped: SMTP env missing");
    };
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return (mail) =>
    transport.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text });
}

const db = openDb(DB_FILE);
const auth = loadAuth();
const sendMail = makeSender(loadSmtp());
const allowPing = createLimiter(300, 60 * 60 * 1000);
const allowFeedback = createLimiter(30, 60 * 60 * 1000);
const allowLogin = createLimiter(5, 60 * 1000);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function cookieValue(header) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === COOKIE) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return "";
}

function sessionCookie(token, secure) {
  const flags = ["HttpOnly", "Path=/zi/", "SameSite=Lax", "Max-Age=43200"];
  if (secure) flags.push("Secure");
  return `${COOKIE}=${encodeURIComponent(token)}; ${flags.join("; ")}`;
}

function clearCookie(secure) {
  const flags = ["HttpOnly", "Path=/zi/", "SameSite=Lax", "Max-Age=0"];
  if (secure) flags.push("Secure");
  return `${COOKIE}=; ${flags.join("; ")}`;
}

const VIEWS = ["day", "version", "os"];

function page(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  :root {
    color-scheme: dark;
    --aubergine: #1b1018;
    --raise: #2a1824;
    --ink: #f3e9ee;
    --muted: #a8949c;
    --line: #5c3d4a;
    --orange: #e95420;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--aubergine);
    color: var(--ink);
    font: 17px/1.45 Ubuntu, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 68rem; margin: 0 auto; padding: 11vh 1.5rem 4.5rem; }
  h1 { margin: 0; font-size: 2.4rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.1; }
  h2 { margin: 2.75rem 0 0.4rem; font-size: 1.25rem; font-weight: 500; }
  p { margin: 0.7rem 0 0; }
  a { color: inherit; }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--orange); outline-offset: 3px; }
  .lede { max-width: 28rem; color: var(--muted); }
  .error { color: #ffb4c0; }
  .login form { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.6rem; }
  .login input {
    min-width: 14rem;
    flex: 1;
    background: var(--raise);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.65rem 0.8rem;
  }
  .go {
    background: var(--orange);
    color: #efe6ec;
    border: 0;
    border-radius: 8px;
    padding: 0.65rem 1.05rem;
    font-weight: 500;
    cursor: pointer;
  }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .logout { margin: 0; }
  .quiet {
    background: transparent;
    color: var(--muted);
    border: 0;
    padding: 0.2rem 0;
    cursor: pointer;
  }
  .views { display: flex; gap: 1.3rem; margin: 1.6rem 0 0.45rem; }
  .views a { color: var(--muted); text-decoration: none; padding-bottom: 0.2rem; }
  .views a.is-on { color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }
  .meter { margin-top: 1.1rem; }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 2rem;
    gap: 0.75rem;
    align-items: center;
    margin: 0.4rem 0;
  }
  .row span:first-child { color: var(--muted); }
  .track { height: 0.55rem; background: var(--raise); border-radius: 99px; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--muted); border-radius: 99px; }
  .fill.is-today { background: var(--orange); }
  .count { text-align: right; font-variant-numeric: tabular-nums; }
  .note {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: start;
    padding: 0.95rem 0;
    border-top: 1px solid var(--line);
  }
  .note p { margin: 0; white-space: pre-wrap; }
  .meta { margin-top: 0.3rem; color: var(--muted); font-size: 0.92rem; }
  .drop { margin: 0; }
  .drop button {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
  }
  .empty { color: var(--muted); }
  @media (max-width: 640px) {
    main { padding: 2.4rem 1.2rem 3rem; }
    h1 { font-size: 2rem; }
    .login form { flex-direction: column; align-items: stretch; }
    .login input { min-width: 0; }
    .row { grid-template-columns: 4.2rem minmax(0, 1fr) 1.6rem; }
  }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function loginHtml(error) {
  return page(
    "ZI Player",
    `<div class="login">
       <h1>ZI Player</h1>
       <p class="lede">用个人网站后台的密码查看人数和反馈。</p>
       ${error ? `<p class="error">${esc(error)}</p>` : ""}
       <form method="post" action="/zi/login">
         <input type="password" name="password" autocomplete="current-password" required aria-label="密码">
         <button class="go" type="submit">登录</button>
       </form>
     </div>`,
  );
}

function viewOf(value) {
  return VIEWS.includes(value) ? value : "day";
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function osLabel(os) {
  if (os === "windows") return "Windows";
  if (os === "linux") return "Linux";
  return "其他";
}

function bars(rows, empty) {
  const max = rows.reduce((peak, row) => Math.max(peak, row.n), 0);
  if (max === 0) return `<p class="empty">${empty}</p>`;
  return `<div class="meter">${rows
    .map((row) => {
      const width = row.n === 0 ? 0 : Math.max(4, Math.round((row.n / max) * 100));
      const mark = row.today ? " is-today" : "";
      return `<div class="row">
        <span>${esc(row.label)}</span>
        <span class="track"><span class="fill${mark}" style="width:${width}%"></span></span>
        <span class="count">${esc(row.n)}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function statsHtml(data, view, today) {
  const rows =
    view === "version"
      ? data.byVersion.map((row) => ({ label: row.label, n: row.n, today: false }))
      : view === "os"
        ? data.byOs.map((row) => ({ label: osLabel(row.label), n: row.n, today: false }))
        : data.series.map((row) => ({ label: row.day.slice(5), n: row.n, today: row.day === today }));
  const blurb =
    view === "version"
      ? "每人按最近一次打开时的版本计数。"
      : view === "os"
        ? "每人按最近一次打开时的系统计数。"
        : "近 14 天，每天打开过播放器的人数。";
  const notes = data.feedback
    .map((row) => {
      const bits = [when(row.created_at), row.kind === "bug" ? "Bug" : "需求", row.version];
      if (row.contact) bits.push(row.contact);
      return `<article class="note">
        <div>
          <p>${esc(row.message)}</p>
          <div class="meta">${bits.map((bit) => esc(bit)).join("  ")}</div>
        </div>
        <form class="drop" method="post" action="/zi/feedback/delete">
          <input type="hidden" name="id" value="${esc(row.id)}">
          <input type="hidden" name="view" value="${esc(view)}">
          <button type="submit">删除</button>
        </form>
      </article>`;
    })
    .join("");
  const links = [
    ["day", "按天"],
    ["version", "按版本"],
    ["os", "按系统"],
  ]
    .map(
      ([key, label]) =>
        `<a href="/zi/?view=${key}"${key === view ? ' class="is-on" aria-current="page"' : ""}>${label}</a>`,
    )
    .join("");
  return page(
    "ZI Player",
    `<div class="head">
       <h1>ZI Player</h1>
       <form class="logout" method="post" action="/zi/logout"><button class="quiet" type="submit">退出</button></form>
     </div>
     <nav class="views">${links}</nav>
     <p class="lede">${blurb}</p>
     ${bars(rows, view === "day" ? "近 14 天没有人打开。" : "还没有人打开过播放器。")}
     <h2>反馈</h2>
     ${notes || `<p class="empty">还没有反馈。</p>`}`,
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

function sendJson(res, status, body, headers = {}) {
  const payload = body ? JSON.stringify(body) : "";
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...CORS, ...headers });
  res.end(payload);
}

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function signedIn(req) {
  return verifySession(cookieValue(req.headers.cookie), auth.secret);
}

function secure(req) {
  return req.headers["x-forwarded-proto"] === "https";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const ip = clientIp(req.headers["x-forwarded-for"], req.socket.remoteAddress);

  try {
    if ((path === "/ping" || path === "/feedback") && req.method === "OPTIONS") {
      sendJson(res, 204, "");
      return;
    }

    if (path === "/ping" && req.method === "POST") {
      if (!allowPing.add(ip)) return sendJson(res, 429, { error: "rate" });
      const row = parsePing(JSON.parse(await readBody(req)));
      if (!row) return sendJson(res, 400, { error: "bad" });
      recordPing(db, row, shanghaiDay(new Date()));
      return sendJson(res, 204, "");
    }

    if (path === "/feedback" && req.method === "POST") {
      if (!allowFeedback.add(ip)) return sendJson(res, 429, { error: "rate" });
      const row = parseFeedback(JSON.parse(await readBody(req)));
      if (!row) return sendJson(res, 400, { error: "bad" });
      await saveFeedback(db, row, new Date().toISOString(), sendMail);
      return sendJson(res, 204, "");
    }

    if ((path === "/zi" || path === "/zi/") && req.method === "GET") {
      if (!signedIn(req)) return send(res, 200, loginHtml(""));
      const now = new Date();
      const today = shanghaiDay(now);
      return send(res, 200, statsHtml(stats(db, today, lastDays(14, now)), viewOf(url.searchParams.get("view")), today));
    }

    if (path === "/zi/feedback/delete" && req.method === "POST") {
      if (!signedIn(req)) {
        return send(res, 303, "", { location: "/zi/", "content-type": "text/plain; charset=utf-8" });
      }
      const form = new URLSearchParams(await readBody(req));
      const id = Number(form.get("id"));
      if (Number.isInteger(id) && id > 0) deleteFeedback(db, id);
      const view = viewOf(form.get("view"));
      return send(res, 303, "", {
        location: `/zi/?view=${view}`,
        "content-type": "text/plain; charset=utf-8",
      });
    }

    if (path === "/zi/login" && req.method === "POST") {
      if (allowLogin.over(ip)) return send(res, 429, loginHtml("尝试次数过多，请稍后再试"));
      const form = new URLSearchParams(await readBody(req));
      if (!passwordsMatch(form.get("password") ?? "", auth.password)) {
        allowLogin.add(ip);
        return send(res, 401, loginHtml("密码不正确"));
      }
      if (!auth.secret || auth.secret.length < 32) {
        return send(res, 500, loginHtml("服务器未配置 AUTH_SECRET"));
      }
      return send(res, 303, "", {
        location: "/zi/",
        "set-cookie": sessionCookie(createSession(auth.secret), secure(req)),
        "content-type": "text/plain; charset=utf-8",
      });
    }

    if (path === "/zi/logout" && req.method === "POST") {
      return send(res, 303, "", {
        location: "/zi/",
        "set-cookie": clearCookie(secure(req)),
        "content-type": "text/plain; charset=utf-8",
      });
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    const status = err && err.status === 413 ? 413 : 400;
    if (path === "/ping" || path === "/feedback") return sendJson(res, status, { error: "bad" });
    send(res, status, loginHtml("请求无法处理"));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`zi-api listening on http://${HOST}:${PORT}`);
});
