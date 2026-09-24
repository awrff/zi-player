import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import { IMPORT_ERROR_COPY } from "@/lib/importError";

const importVideo = vi.fn();
const probeVideoCollection = vi.fn();

vi.mock("@/lib/importer", () => ({
  importVideo: (...args: unknown[]) => importVideo(...args),
}));

vi.mock("@/lib/native", () => ({
  native: {
    probeVideoCollection: (...args: unknown[]) => probeVideoCollection(...args),
    cancelImport: vi.fn(async () => {}),
    onImportProgress: vi.fn(() => () => {}),
  },
}));

import { AddVideoModal } from "./AddVideoModal";

function renderModal() {
  return render(
    <App>
      <AddVideoModal open onClose={() => {}} />
    </App>,
  );
}

beforeEach(() => {
  importVideo.mockReset();
  probeVideoCollection.mockReset();
});

describe("AddVideoModal", () => {
  it("shows a distinguishable Chinese toast when import fails", async () => {
    probeVideoCollection.mockRejectedValue(new Error("probe down"));
    importVideo.mockResolvedValue({
      ok: false,
      reason: "network",
      detail: IMPORT_ERROR_COPY.network,
    });

    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("video-url-input"), "https://www.bilibili.com/video/BV1xx411c7mD");
    await user.click(screen.getByRole("button", { name: /添\s*加/ }));

    expect(await screen.findByText(IMPORT_ERROR_COPY.network)).toBeInTheDocument();
    expect(screen.queryByText("解析失败，请检查链接后重试")).not.toBeInTheDocument();
  });

  it("degrades to a single import with a hint when the probe fails", async () => {
    probeVideoCollection.mockRejectedValue(new Error("probe down"));
    importVideo.mockResolvedValue({ ok: true, item: { id: "BV1xx411c7mD" } as never });

    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("video-url-input"), "https://www.bilibili.com/video/BV1xx411c7mD");
    await user.click(screen.getByRole("button", { name: /添\s*加/ }));

    expect(await screen.findByText("未能识别选集，已按单个视频导入")).toBeInTheDocument();
    expect(importVideo).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(screen.queryByLabelText("episode-filter")).not.toBeInTheDocument();
  });

  it("opens the episode picker when the probe reports a collection", async () => {
    probeVideoCollection.mockResolvedValue({
      kind: "multi_p",
      title: "示例合集",
      episodes: [
        { index: 1, bvid: "BV1gq4y167mq", page: 1, title: "p01 默", duration: 295 },
        { index: 2, bvid: "BV1gq4y167mq", page: 2, title: "p02 Melody", duration: 254 },
      ],
    });

    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("video-url-input"), "https://www.bilibili.com/video/BV1gq4y167mq");
    await user.click(screen.getByRole("button", { name: /添\s*加/ }));

    expect(await screen.findByLabelText("episode-filter")).toBeInTheDocument();
    expect(await screen.findByText("示例合集")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入所选 2 个" })).toBeInTheDocument();
    expect(importVideo).not.toHaveBeenCalled();
  });

  it("imports directly without the picker when the probe reports a single video", async () => {
    probeVideoCollection.mockResolvedValue({ kind: "single", title: "", episodes: [] });
    importVideo.mockResolvedValue({ ok: true, item: { id: "BV1xx411c7mD" } as never });

    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("video-url-input"), "https://www.bilibili.com/video/BV1xx411c7mD");
    await user.click(screen.getByRole("button", { name: /添\s*加/ }));

    expect(await screen.findByText("已开始导入")).toBeInTheDocument();
    expect(screen.queryByLabelText("episode-filter")).not.toBeInTheDocument();
  });
});
