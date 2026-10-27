import { expect, test } from "@playwright/test";
import { gotoBoard } from "./helpers";

test("imports selected episodes from a probed multi-P collection", async ({ page }) => {
  await gotoBoard(page, []);
  await page.evaluate(() => {
    window.__nativeMock!.probeFixtures["BV1xx411c7mG"] = {
      kind: "multi_p",
      title: "Sample collection",
      episodes: [
        { index: 1, bvid: "BV1xx411c7mG", page: 1, title: "p01 One", duration: 100 },
        { index: 2, bvid: "BV1xx411c7mG", page: 2, title: "p02 Two", duration: 120 },
      ],
    };
  });

  await page.getByRole("button", { name: /添\s*加/ }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("video-url-input").fill("https://www.bilibili.com/video/BV1xx411c7mG");
  await modal.getByRole("button", { name: /添\s*加/ }).click();

  const picker = page.getByRole("dialog").filter({ has: page.getByLabel("episode-filter") });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: "导入所选 2 个" })).toBeVisible();

  await picker.getByRole("checkbox").nth(1).click();
  await picker.getByRole("button", { name: "导入所选 1 个" }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toHaveAttribute("data-import-status", "ready");
  await expect(page.getByTestId("turntable").first()).toContainText("Sample video 4");
});

test("opens the picker for a space collection link", async ({ page }) => {
  await gotoBoard(page, []);
  await page.evaluate(() => {
    window.__nativeMock!.probeFixtures[
      "https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445"
    ] = {
      kind: "list",
      title: "Space collection",
      episodes: [{ index: 1, bvid: "BV1xx411c7mF", title: "Ep 1", duration: 95 }],
    };
  });

  await page.getByRole("button", { name: /添\s*加/ }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("video-url-input")
    .fill("https://space.bilibili.com/2142762/channel/collectiondetail?sid=57445");
  await modal.getByRole("button", { name: /添\s*加/ }).click();

  const picker = page.getByRole("dialog").filter({ has: page.getByLabel("episode-filter") });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("Space collection");
  await picker.getByRole("button", { name: "导入所选 1 个" }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toHaveAttribute("data-import-status", "ready");
});

test("degrades to a single import when the probe fails", async ({ page }) => {
  await gotoBoard(page, []);
  await page.evaluate(() => {
    window.__nativeMock!.probeError = "网络请求失败";
  });

  await page.getByRole("button", { name: /添\s*加/ }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("video-url-input").fill("https://www.bilibili.com/video/BV1xx411c7mD");
  await modal.getByRole("button", { name: /添\s*加/ }).click();

  await expect(page.getByTestId("turntable")).toHaveCount(1);
  await expect(page.getByTestId("turntable").first()).toHaveAttribute("data-import-status", "ready");
  await expect(page.getByLabel("episode-filter")).toHaveCount(0);
});
