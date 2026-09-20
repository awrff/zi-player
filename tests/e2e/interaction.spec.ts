import { expect, test } from "@playwright/test";
import { gotoBoard, html5DragAndDrop, sampleItems } from "./helpers";

test("adds a record through the add dialog", async ({ page }) => {
  await gotoBoard(page, []);
  await page.getByRole("button", { name: /添\s*加/ }).click();

  const modal = page.getByRole("dialog");
  await modal.getByLabel("video-url-input").fill("https://www.bilibili.com/video/BV1xx411c7mD");
  await modal.getByRole("button", { name: "解析并添加" }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toContainText("Sample video 1");
});

test("playing toggles the spinning record", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  const card = page.getByTestId("turntable").first();

  await expect(card).not.toHaveAttribute("data-playing", "true");

  await card.click();
  await expect(card).toHaveAttribute("data-playing", "true");
  await expect(card.getByTestId("vinyl-disc")).toHaveAttribute("data-spinning", "true");

  await card.click();
  await expect(card).not.toHaveAttribute("data-playing", "true");
  await expect(card.getByTestId("vinyl-disc")).not.toHaveAttribute("data-spinning", "true");
});

test("deletes a record", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await page.getByRole("button", { name: /删\s*除/ }).click();

  await expect(page.getByTestId("board-empty")).toBeVisible();
});

test("reorders filtered records using store indices, not visible indices", async ({ page }) => {
  await gotoBoard(page, [
    { ...sampleItems[0], id: "A", title: "Alpha one" },
    { ...sampleItems[1], id: "B", title: "Beta" },
    { ...sampleItems[2], id: "C", title: "Alpha two" },
  ]);

  await page.getByLabel("search-input").fill("Alpha");
  const slots = page.getByTestId("board-slot");
  await expect(slots).toHaveCount(2);
  await html5DragAndDrop(slots.nth(0), slots.nth(1));

  await page.getByLabel("search-input").fill("");
  const cards = page.getByTestId("turntable");
  await expect(cards.nth(0)).toHaveAttribute("data-id", "B");
  await expect(cards.nth(1)).toHaveAttribute("data-id", "C");
  await expect(cards.nth(2)).toHaveAttribute("data-id", "A");

  const stored = await page.evaluate(() => localStorage.getItem("bili-board"));
  const persisted = JSON.parse(stored!) as { state: { items: { id: string }[] } };
  expect(persisted.state.items.map((item) => item.id)).toEqual(["B", "C", "A"]);
});

test("reorders records by dragging one onto another and persists the order", async ({ page }) => {
  await gotoBoard(page, sampleItems);

  const slots = page.getByTestId("board-slot");
  await html5DragAndDrop(slots.nth(0), slots.nth(2));

  const cards = page.getByTestId("turntable");
  await expect(cards.nth(0)).toHaveAttribute("data-id", sampleItems[1].id);
  await expect(cards.nth(1)).toHaveAttribute("data-id", sampleItems[2].id);
  await expect(cards.nth(2)).toHaveAttribute("data-id", sampleItems[0].id);

  const stored = await page.evaluate(() => localStorage.getItem("bili-board"));
  expect(stored).toBeTruthy();
  const persisted = JSON.parse(stored!) as { state: { items: { id: string }[] } };
  expect(persisted.state.items.map((item) => item.id)).toEqual([
    sampleItems[1].id,
    sampleItems[2].id,
    sampleItems[0].id,
  ]);
});

test("renames a record", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  await page.getByRole("button", { name: "rename", exact: true }).click();

  const modal = page.getByRole("dialog");
  await modal.getByLabel("rename-input").fill("Renamed record");
  await modal.getByRole("button", { name: /保\s*存/ }).click();

  await expect(page.getByTestId("turntable").first()).toContainText("Renamed record");
});

test("prompts to import a clipboard link when the window is shown", async ({ page }) => {
  await gotoBoard(page, []);

  await page.evaluate(() => {
    window.__nativeMock!.clipboard = "https://www.bilibili.com/video/BV1xx411c7mE";
    window.__nativeMock!.emitShow();
  });

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("检测到剪贴板中的视频链接");
  await modal.getByRole("button", { name: /导\s*入/ }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toContainText("Sample video 2");
});

test("detects a clipboard link on app open", async ({ page }) => {
  await page.addInitScript(() => {
    window.__preSetClipboard = "https://www.bilibili.com/video/BV1xx411c7mF";
  });
  await page.goto("/");

  await expect(page.getByRole("dialog")).toContainText("检测到剪贴板中的视频链接");
});

test("registers the global hotkey and summons the window", async ({ page }) => {
  await gotoBoard(page, []);

  const registered = await page.evaluate(() => typeof window.__nativeMock?.hotkeyHandler === "function");
  expect(registered).toBe(true);

  await page.evaluate(() => window.__nativeMock!.fireHotkey());
  const hidden = await page.evaluate(() => window.__nativeMock!.hidden);
  expect(hidden).toBe(false);
});
