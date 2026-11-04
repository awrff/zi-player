import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

test("batch-creates a playlist from selected songs", async ({ page }) => {
  await gotoBoard(page, sampleItems);

  await page.getByTestId("batch-manage").click();
  await expect(page.getByTestId("batch-bar")).toBeVisible();
  await page.getByTestId("turntable").nth(0).click();
  await page.getByTestId("turntable").nth(1).click();
  await expect(page.getByTestId("library-heading")).toContainText("2 已选");

  await page.getByRole("button", { name: "添加到歌单" }).click();
  await page.getByRole("menuitem", { name: "新建歌单" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("playlist-name-input").fill("精选");
  await modal.getByRole("button", { name: /保\s*存/ }).click();

  await expect(page.getByTestId("library-heading")).toContainText("精选");
  await expect(page.getByTestId("turntable")).toHaveCount(2);
  await expect(page.getByTestId("batch-manage")).toBeVisible();
});

test("batch-deletes records even when disk cleanup fails", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 2));
  await page.evaluate(() => {
    window.__nativeMock!.deleteCacheError = "locked";
  });

  await page.getByTestId("batch-manage").click();
  await page.getByTestId("turntable").nth(0).click();
  await page.getByTestId("turntable").nth(1).click();
  await page.getByTestId("batch-bar").getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /删\s*除/ }).click();

  await expect(page.getByTestId("board-empty")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__nativeMock!.deletedSongIds.slice().sort()))
    .toEqual(["BV1xx411c7mD", "BV1xx411c7mE"]);
  await expect(page.getByText("locked", { exact: false })).toHaveCount(0);
});

test("clicking a song still plays when not managing", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  const card = page.getByTestId("turntable").first();
  await card.click();
  await expect(card).toHaveAttribute("data-playing", "true");
});
