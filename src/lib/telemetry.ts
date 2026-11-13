const INSTALL_KEY = "zi-player-install";
const PING_DAY_KEY = "zi-player-ping-day";
const ENDPOINT = "https://jaydendev.cloud/api/zi";

export type OsName = "windows" | "linux" | "other";
export type FeedbackKind = "bug" | "feature";

type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function osName(ua: string): OsName {
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Linux")) return "linux";
  return "other";
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function installId(storage: Storage): string {
  const existing = storage.getItem(INSTALL_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(INSTALL_KEY, id);
  return id;
}

async function postJson(fetchImpl: typeof fetch, path: string, body: unknown): Promise<void> {
  const res = await fetchImpl(`${ENDPOINT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`telemetry ${res.status}`);
}

export async function pingDaily(opts: {
  storage: Storage;
  version: string;
  ua: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  dev?: boolean;
}): Promise<void> {
  if (opts.dev) return;
  const day = todayKey(opts.now);
  if (opts.storage.getItem(PING_DAY_KEY) === day) return;
  const id = installId(opts.storage);
  await postJson(opts.fetchImpl ?? fetch, "/ping", { id, v: opts.version, os: osName(opts.ua) });
  opts.storage.setItem(PING_DAY_KEY, day);
}

export async function sendFeedback(opts: {
  storage: Storage;
  version: string;
  ua: string;
  kind: FeedbackKind;
  message: string;
  contact?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const id = installId(opts.storage);
  await postJson(opts.fetchImpl ?? fetch, "/feedback", {
    id,
    v: opts.version,
    os: osName(opts.ua),
    kind: opts.kind,
    message: opts.message,
    contact: opts.contact ?? "",
  });
}
