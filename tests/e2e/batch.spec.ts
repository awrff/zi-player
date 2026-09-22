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

test("clicking a song still plays when not managing", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  const card = page.getByTestId("turntable").first();
  await card.click();
  await expect(card).toHaveAttribute("data-playing", "true");
});
