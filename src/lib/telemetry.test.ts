import { pingDaily } from "./telemetry";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const now = new Date(2026, 10, 12, 9, 0, 0);

test("a second launch the same day does not ping again", async () => {
  const storage = memoryStorage();
  const calls: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await pingDaily({ storage, version: "1.1.0", ua: "Windows", fetchImpl, now });
  await pingDaily({ storage, version: "1.1.0", ua: "Windows", fetchImpl, now });

  expect(calls).toEqual(["https://jaydendev.cloud/api/zi/ping"]);
  expect(storage.data.get("zi-player-ping-day")).toBe("2026-11-12");
});

test("the next day pings again", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await pingDaily({ storage, version: "1.1.0", ua: "Linux", fetchImpl, now });
  await pingDaily({
    storage,
    version: "1.1.0",
    ua: "Linux",
    fetchImpl,
    now: new Date(2026, 10, 13, 9, 0, 0),
  });

  expect(calls).toBe(2);
});

test("a failed ping is retried on the next launch", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 500 });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  await expect(pingDaily({ storage, version: "1.1.0", ua: "Windows", fetchImpl, now })).rejects.toThrow();
  await pingDaily({ storage, version: "1.1.0", ua: "Windows", fetchImpl, now });

  expect(calls).toBe(2);
  expect(storage.data.get("zi-player-ping-day")).toBe("2026-11-12");
});
