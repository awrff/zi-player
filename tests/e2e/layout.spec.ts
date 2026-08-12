import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

/**
 * Layout / distribution checks (requirement: elements display correctly and
 * are distributed reasonably).
 */
test("records stay within the viewport and are spaced consistently", async ({ page }) => {
  await gotoBoard(page, sampleItems);

  const viewport = page.viewportSize()!;
  const cards = page.getByTestId("turntable");
  const boxes = [];
  for (let i = 0; i < 3; i++) {
    boxes.push(await cards.nth(i).boundingBox());
  }

  for (const box of boxes) {
    expect(box).not.toBeNull();
    // No horizontal overflow beyond the viewport.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  }

  // Consistent horizontal gap between adjacent cards in the same row.
  const gap = boxes[1].x - (boxes[0].x + boxes[0].width);
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThanOrEqual(40);
});

test("cover sits above the deck without hiding it, title below the deck", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));

  const card = page.getByTestId("turntable").first();
  const cover = await card.locator(".turntable-cover").boundingBox();
  const deck = await card.locator(".turntable-deck").boundingBox();
  const title = await card.locator(".turntable-title").boundingBox();

  expect(cover).not.toBeNull();
  expect(deck).not.toBeNull();
  expect(title).not.toBeNull();

  // Cover starts above the deck.
  expect(cover!.y).toBeLessThan(deck!.y);
  // The deck is not fully covered: its bottom extends below the cover's bottom.
  expect(deck!.y + deck!.height).toBeGreaterThan(cover!.y + cover!.height);
  // Title sits below the deck.
  expect(title!.y).toBeGreaterThanOrEqual(deck!.y + deck!.height - 6);
});
