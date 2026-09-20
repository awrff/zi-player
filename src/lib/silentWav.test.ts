import { describe, expect, it } from "vitest";
import { silentWavDataUri } from "./silentWav";

describe("silentWavDataUri", () => {
  it("builds a RIFF/WAVE data URI", () => {
    const uri = silentWavDataUri(0.1);
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = atob(uri.slice(uri.indexOf(",") + 1));
    expect(bytes.slice(0, 4)).toBe("RIFF");
    expect(bytes.slice(8, 12)).toBe("WAVE");
  });
});
