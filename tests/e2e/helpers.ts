import type { Page } from "@playwright/test";
import type { VideoItem } from "../../src/types";

export interface SeedItem {
  id: string;
  url: string;
  title: string;
  uploader: string;
  duration: number;
  cover: string;
  addedAt?: number;
  cachePath?: string;
}

/** Navigate to the app with the given items pre-seeded in the persisted store. */
export async function gotoBoard(page: Page, items: SeedItem[] = []): Promise<void> {
  const seed: VideoItem[] = items.map((i) => ({
    addedAt: 1,
    ...i,
  }));

  await page.addInitScript(
    (records) => {
      localStorage.setItem("bili-board", JSON.stringify({ state: { items: records }, version: 0 }));
    },
    seed,
  );

  await page.goto("/");
}

export const sampleItems: SeedItem[] = [
  {
    id: "BV1xx411c7mD",
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    title: "First record",
    uploader: "Alice",
    duration: 180,
    cover: "data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><rect width='320' height='320' fill='%23e95420'/></svg>",
    cachePath: "data:audio/mpeg;base64,",
  },
  {
    id: "BV1xx411c7mE",
    url: "https://www.bilibili.com/video/BV1xx411c7mE",
    title: "Second record",
    uploader: "Bob",
    duration: 241,
    cover: "data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><rect width='320' height='320' fill='%23333'/></svg>",
    cachePath: "data:audio/mpeg;base64,",
  },
  {
    id: "BV1xx411c7mF",
    url: "https://www.bilibili.com/video/BV1xx411c7mF",
    title: "Third record",
    uploader: "Carol",
    duration: 95,
    cover: "data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><rect width='320' height='320' fill='%23555'/></svg>",
    cachePath: "data:audio/mpeg;base64,",
  },
];
