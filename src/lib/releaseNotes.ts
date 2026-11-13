const PLACEHOLDER = "See the assets to download this version and install.";
const RELEASE_NOTES_TIMEOUT_MS = 2000;

/** Prefer the GitHub release body. The updater manifest often only has the placeholder. */
export function pickReleaseNotes(manifestNotes: string, releaseBody: string | null): string {
  const body = (releaseBody ?? "").trim();
  if (body && body !== PLACEHOLDER) return body;
  const notes = manifestNotes.trim();
  if (notes && notes !== PLACEHOLDER) return notes;
  return "";
}

export async function loadReleaseNotes(
  version: string,
  manifestNotes: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = RELEASE_NOTES_TIMEOUT_MS,
): Promise<string> {
  const notes = manifestNotes.trim();
  if (notes && notes !== PLACEHOLDER) return notes;

  const tag = version.startsWith("v") ? version : `v${version}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: string | null = null;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/awrff/zi-player/releases/tags/${tag}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { body?: unknown };
      body = typeof data.body === "string" ? data.body : "";
    }
  } catch {
    body = null;
  } finally {
    clearTimeout(timer);
  }
  return pickReleaseNotes(manifestNotes, body);
}
