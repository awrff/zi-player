import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems, type SeedItem } from "./helpers";

const sixItems: SeedItem[] = [
  ...sampleItems,
  {
    id: "BV1xx411c7mG",
    url: "https://www.bilibili.com/video/BV1xx411c7mG",
    title: "Fourth record",
    uploader: "Dave",
    duration: 111,
    cover: sampleItems[0].cover,
    cachePath: sampleItems[0].cachePath,
  },
  {
    id: "BV1xx411c7mH",
    url: "https://www.bilibili.com/video/BV1xx411c7mH",
    title: "Fifth record",
    uploader: "Eve",
    duration: 222,
    cover: sampleItems[1].cover,
    cachePath: sampleItems[0].cachePath,
  },
  {
    id: "BV1xx411c7mI",
    url: "https://www.bilibili.com/video/BV1xx411c7mI",
    title: "Sixth record",
    uploader: "Frank",
    duration: 333,
    cover: sampleItems[2].cover,
    cachePath: sampleItems[0].cachePath,
  },
];

async function gridColumns(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-testid="board-grid"]') as HTMLElement | null;
    if (!grid) return 0;
    return getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  });
}

async function hasHorizontalOverflow(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

test("desktop layout uses multiple columns without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoBoard(page, sixItems);

  await expect(page.getByTestId("turntable")).toHaveCount(6);
  const columns = await gridColumns(page);
  expect(columns).toBeGreaterThanOrEqual(3);
  expect(columns).toBeLessThan(6);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("narrow layout collapses columns and never overflows horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await gotoBoard(page, sixItems);

  await expect(page.getByTestId("turntable")).toHaveCount(6);
  const columns = await gridColumns(page);
  expect(columns).toBeGreaterThanOrEqual(1);
  expect(columns).toBeLessThanOrEqual(3);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
