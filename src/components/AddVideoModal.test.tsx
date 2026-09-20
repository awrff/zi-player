import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import { IMPORT_ERROR_COPY } from "@/lib/importError";

const importVideo = vi.fn();

vi.mock("@/lib/importer", () => ({
  importVideo: (...args: unknown[]) => importVideo(...args),
}));

import { AddVideoModal } from "./AddVideoModal";

function renderModal() {
  return render(
    <App>
      <AddVideoModal open onClose={() => {}} />
    </App>,
  );
}

describe("AddVideoModal", () => {
  it("shows a distinguishable Chinese toast when import fails", async () => {
    importVideo.mockResolvedValue({
      ok: false,
      reason: "network",
      detail: IMPORT_ERROR_COPY.network,
    });

    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("video-url-input"), "https://www.bilibili.com/video/BV1xx411c7mD");
    await user.click(screen.getByRole("button", { name: /解析并添加/ }));

    expect(await screen.findByText(IMPORT_ERROR_COPY.network)).toBeInTheDocument();
    expect(screen.queryByText("解析失败，请检查链接后重试")).not.toBeInTheDocument();
  });
});
