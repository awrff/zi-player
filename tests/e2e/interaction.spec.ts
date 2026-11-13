import { expect, test } from "@playwright/test";
import { gotoBoard, sampleItems } from "./helpers";

test("adds a record through the add dialog", async ({ page }) => {
  await gotoBoard(page, []);
  await page.getByRole("button", { name: /添\s*加/ }).click();

  const modal = page.getByRole("dialog");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("border-radius", "16px");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("background-color", "rgba(40, 26, 36, 0.96)");
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
  const modal = page.getByRole("dialog");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("border-radius", "16px");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("background-color", "rgba(40, 26, 36, 0.96)");
  await modal.getByRole("button", { name: /删\s*除/ }).click();

  await expect(page.getByTestId("board-empty")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__nativeMock!.deletedSongIds)).toEqual(["BV1xx411c7mD"]);
});

test("uses the app theme for the update dialog", async ({ page }) => {
  await page.addInitScript(() => {
    window.__preSetUpdate = { version: "2.0.0", notes: "修复播放问题\n改进资料库体验" };
  });
  await gotoBoard(page, []);

  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("发现新版本 2.0.0");
  await expect(modal).toContainText("改进资料库体验");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("border-radius", "16px");
  await expect(page.locator(".ant-modal-container")).toHaveCSS("background-color", "rgba(40, 26, 36, 0.96)");
  await expect(modal.getByRole("button", { name: /更\s*新/ })).toHaveCSS("background-color", "rgb(233, 84, 32)");
  await modal.getByRole("button", { name: /稍\s*后/ }).click();
  await expect(modal).toBeHidden();
});

test("skips the update dialog for this version and keeps an icon button", async ({ page }) => {
  await page.addInitScript(() => {
    window.__preSetUpdate = { version: "2.0.0", notes: "修复播放问题\n改进资料库体验" };
  });
  await gotoBoard(page, []);

  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("发现新版本 2.0.0");
  await modal.getByRole("checkbox", { name: "此版本不再提示" }).check();
  await modal.getByRole("button", { name: /稍\s*后/ }).click();
  await expect(modal).toBeHidden();

  await page.reload();
  const updateButton = page.getByTestId("app-update");
  await expect(updateButton).toBeVisible();
  await expect(updateButton).toHaveAttribute("aria-label", "更新");
  await expect(updateButton).toHaveText("");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await updateButton.click();
  await expect(page.getByRole("dialog")).toContainText("改进资料库体验");
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

test("does not prompt again for the same clipboard link", async ({ page }) => {
  await gotoBoard(page, []);

  await page.evaluate(() => {
    window.__nativeMock!.clipboard = "https://www.bilibili.com/video/BV1xx411c7mE";
    window.__nativeMock!.emitShow();
  });

  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("检测到剪贴板中的视频链接");
  await modal.getByRole("button", { name: /忽\s*略/ }).click();
  await expect(modal).toBeHidden();

  await page.evaluate(() => window.__nativeMock!.emitShow());
  await page.waitForTimeout(150);
  await expect(modal).toBeHidden();

  await page.evaluate(() => {
    window.__nativeMock!.clipboard = "https://www.bilibili.com/video/BV1xx411c7mF";
    window.__nativeMock!.emitShow();
  });
  await expect(modal).toContainText("BV1xx411c7mF");
});

test("detects a clipboard link on app open", async ({ page }) => {
  await page.addInitScript(() => {
    window.__preSetClipboard = "https://www.bilibili.com/video/BV1xx411c7mF";
  });
  await page.goto("/");

  await expect(page.getByRole("dialog")).toContainText("检测到剪贴板中的视频链接");
});
