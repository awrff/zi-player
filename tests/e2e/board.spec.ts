import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

test("shows an empty state when the board is empty", async ({ page }) => {
  await gotoBoard(page, []);
  await expect(page.getByTestId("board-empty")).toBeVisible();
  await expect(page.getByTestId("player-bar")).toBeVisible();
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
