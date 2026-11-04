import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  checkUpdate: vi.fn(),
  installUpdate: vi.fn(),
  relaunch: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
}));

vi.mock("antd", () => ({
  Modal: {
    confirm: h.confirm,
    error: h.error,
  },
}));

vi.mock("@/lib/native", () => ({
  native: {
    checkUpdate: h.checkUpdate,
    installUpdate: h.installUpdate,
    relaunch: h.relaunch,
  },
}));

import { useAppUpdater } from "./useAppUpdater";

beforeEach(() => {
  h.checkUpdate.mockReset();
  h.installUpdate.mockReset();
  h.relaunch.mockReset();
  h.confirm.mockReset();
  h.error.mockReset();
  h.checkUpdate.mockResolvedValue({ version: "1.0.0", notes: "Bug fixes" });
  h.installUpdate.mockResolvedValue(undefined);
  h.relaunch.mockResolvedValue(undefined);
});

describe("useAppUpdater", () => {
  it("installs and relaunches after the user confirms", async () => {
    renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    const options = h.confirm.mock.calls[0][0];
    expect(options.title).toBe("发现新版本 1.0.0");
    expect(options.content).toBe("Bug fixes");

    await options.onOk();

    expect(h.installUpdate).toHaveBeenCalledTimes(1);
    expect(h.relaunch).toHaveBeenCalledTimes(1);
    expect(h.error).not.toHaveBeenCalled();
  });

  it("shows the installation error and does not relaunch", async () => {
    h.installUpdate.mockRejectedValue("403 rate limit exceeded");
    renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    await h.confirm.mock.calls[0][0].onOk();

    expect(h.relaunch).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith({
      title: "更新失败",
      content: "下载或安装更新时出错：403 rate limit exceeded",
      okText: "知道了",
    });
  });
});
