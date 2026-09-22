import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

test("adds a record through the add dialog", async ({ page }) => {
  await gotoBoard(page, []);
  await page.getByRole("button", { name: /添\s*加/ }).click();

  const modal = page.getByRole("dialog");
  await modal.getByLabel("video-url-input").fill("https://www.bilibili.com/video/BV1xx411c7mD");
  await modal.getByRole("button", { name: /添\s*加/ }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toContainText("Sample video 1");
  await expect(page.getByTestId("turntable").first()).toHaveAttribute("data-import-status", "ready");
  await expect(page.getByTestId("cache-badge")).toBeVisible();
});

test("does not play a song until import finishes", async ({ page }) => {
  await gotoBoard(page, []);
  await page.evaluate(() => {
    window.__nativeMock!.downloadGate = new Promise(() => {});
  });
  await page.getByRole("button", { name: /添\s*加/ }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("video-url-input").fill("https://www.bilibili.com/video/BV1xx411c7mD");
  await modal.getByRole("button", { name: /添\s*加/ }).click();

  const card = page.getByTestId("turntable").first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId("import-status")).toBeVisible();
  await expect(card).not.toHaveAttribute("data-ready");
  await expect(card).toHaveAttribute("aria-disabled", "true");
  await card.click({ force: true });
  await expect(card).not.toHaveAttribute("data-playing", "true");
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
  await page.getByTestId("turntable").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除" }).click();
  await page.getByRole("button", { name: /删\s*除/ }).click();

  await expect(page.getByTestId("board-empty")).toBeVisible();
});

test("renames a record", async ({ page }) => {
  await gotoBoard(page, sampleItems.slice(0, 1));
  await page.getByTestId("turntable").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "重命名" }).click();

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
