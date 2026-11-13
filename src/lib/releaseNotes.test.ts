import { describe, expect, it, vi } from "vitest";
import { loadReleaseNotes, pickReleaseNotes } from "./releaseNotes";

const placeholder = "See the assets to download this version and install.";

describe("pickReleaseNotes", () => {
  it("prefers the GitHub release body over the manifest placeholder", () => {
    expect(pickReleaseNotes(placeholder, "## 新增\n- 清理缓存")).toBe("## 新增\n- 清理缓存");
  });

  it("ignores the placeholder in both sources", () => {
    expect(pickReleaseNotes(placeholder, `  ${placeholder}  `)).toBe("");
    expect(pickReleaseNotes(placeholder, "  ")).toBe("");
    expect(pickReleaseNotes("真实说明", null)).toBe("真实说明");
  });
});

describe("loadReleaseNotes", () => {
  it("reads the release body for the version tag", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ body: "新增缓存清理" }),
    });

    await expect(loadReleaseNotes("1.1.0", placeholder, fetchImpl)).resolves.toBe("新增缓存清理");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/awrff/zi-player/releases/tags/v1.1.0",
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
  });

  it("skips the request when the manifest already has notes", async () => {
    const fetchImpl = vi.fn();
    await expect(loadReleaseNotes("1.1.0", "真实说明", fetchImpl)).resolves.toBe("真实说明");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops waiting when the release lookup is slow", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    await expect(loadReleaseNotes("1.1.0", placeholder, fetchImpl, 20)).resolves.toBe("");
  });

  it("falls back to manifest notes when the request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(loadReleaseNotes("1.1.0", "来自清单", fetchImpl)).resolves.toBe("来自清单");
  });
});
