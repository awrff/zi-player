import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

test("shows an empty state when the board is empty", async ({ page }) => {
  await gotoBoard(page, []);
  await expect(page.getByTestId("board-empty")).toBeVisible();
  await expect(page.getByTestId("player-bar")).toBeVisible();
  await expect(page.getByTestId("library-sidebar")).toBeVisible();
  await expect(page.getByTestId("library-all")).toContainText("全部唱片");
  await expect(page.getByTestId("library-new-playlist")).toBeEnabled();
});

test("creates a playlist and switches between library views", async ({ page }) => {
  await gotoBoard(page, sampleItems);

  await page.getByTestId("library-new-playlist").click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("playlist-name-input").fill("通勤");
  await modal.getByRole("button", { name: /保\s*存/ }).click();

  await expect(page.getByTestId("library-playlist")).toContainText("通勤");
  await expect(page.getByTestId("library-heading")).toContainText("通勤");
  await expect(page.getByTestId("board-empty-guide")).toContainText("这个歌单还是空的");

  await page.getByTestId("library-all").click();
  await expect(page.getByTestId("library-heading")).toContainText("全部唱片");
  await expect(page.getByTestId("turntable")).toHaveCount(3);

  await page.getByTestId("board-view-toggle").getByText("列表").click();
  await expect(page.getByTestId("track-list")).toBeVisible();
  await expect(page.getByTestId("track-row")).toHaveCount(3);
});

test("renders a cover, spinning disc and title for every record", async ({ page }) => {
  await gotoBoard(page, sampleItems);

  const cards = page.getByTestId("turntable");
  await expect(cards).toHaveCount(3);

  for (let i = 0; i < sampleItems.length; i++) {
    const card = cards.nth(i);
    await expect(card.locator(".turntable-cover")).toHaveAttribute("src", /data:image\/svg/);
    await expect(card.getByTestId("vinyl-disc")).toBeVisible();
    await expect(card).toContainText(sampleItems[i].title);
    await expect(card).toContainText(sampleItems[i].uploader);
  }
});
