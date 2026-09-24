import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import type { CollectionProbe } from "@/types";

const enqueueEpisodes = vi.fn();

vi.mock("@/lib/importQueue", () => ({
  enqueueEpisodes: (...args: unknown[]) => enqueueEpisodes(...args),
}));

import { EpisodePickerModal } from "./EpisodePickerModal";

function probeFixture(): CollectionProbe {
  return {
    kind: "multi_p",
    title: "示例合集",
    episodes: [
      { index: 1, bvid: "BV1gq4y167mq", page: 1, title: "p01 默", duration: 295 },
      { index: 2, bvid: "BV1gq4y167mq", page: 2, title: "p02 Melody", duration: 254 },
      { index: 3, bvid: "BV1gq4y167mq", page: 3, title: "p03 蝇", duration: 241 },
    ],
  };
}

function renderPicker(onClose = vi.fn(), onEnqueued?: (queued: number) => void) {
  render(
    <App>
      <EpisodePickerModal open probe={probeFixture()} onClose={onClose} onEnqueued={onEnqueued} />
    </App>,
  );
  return { onClose };
}

beforeEach(() => {
  enqueueEpisodes.mockReset();
  enqueueEpisodes.mockImplementation((chosen: unknown[]) => ({ queued: chosen.length, skipped: 0 }));
});

describe("EpisodePickerModal", () => {
  it("preselects every episode and enqueues the selection on confirm", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onEnqueued = vi.fn();
    renderPicker(onClose, onEnqueued);

    expect(screen.getByRole("button", { name: "导入所选 3 个" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);

    await user.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByRole("button", { name: "导入所选 2 个" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "导入所选 2 个" }));

    expect(enqueueEpisodes).toHaveBeenCalledWith([
      expect.objectContaining({ index: 1 }),
      expect.objectContaining({ index: 3 }),
    ]);
    expect(await screen.findByText("已开始导入 2 个视频")).toBeInTheDocument();
    expect(onEnqueued).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it("filters episodes and 全选/清空 only affect the visible rows", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /清\s*空/ }));
    expect(screen.getByRole("button", { name: "导入所选 0 个" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("episode-filter"), "melody");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /全\s*选/ }));
    await user.clear(screen.getByLabelText("episode-filter"));
    expect(screen.getByRole("button", { name: "导入所选 1 个" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getAllByRole("checkbox")[2]);
    expect(screen.getByRole("button", { name: "导入所选 3 个" })).toBeInTheDocument();
  });

  it("disables confirm when nothing is selected", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /清\s*空/ }));
    expect(screen.getByRole("button", { name: "导入所选 0 个" })).toBeDisabled();
  });

  it("shows the duration per episode", () => {
    renderPicker();
    expect(screen.getAllByText("4:55")).toHaveLength(1);
  });
});
