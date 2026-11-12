import type { ReactNode } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  checkUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installDownloaded: vi.fn(),
  relaunch: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
}));

vi.mock("antd", () => ({
  App: {
    useApp: () => ({
      modal: {
        confirm: h.confirm,
        error: h.error,
      },
    }),
  },
  Checkbox: ({
    children,
    className,
    defaultChecked,
    onChange,
  }: {
    children?: ReactNode;
    className?: string;
    defaultChecked?: boolean;
    onChange?: (event: { target: { checked: boolean } }) => void;
  }) => (
    <label className={className}>
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        onChange={(event) => onChange?.({ target: { checked: event.target.checked } })}
      />
      {children}
    </label>
  ),
  Progress: ({
    percent,
    showInfo = true,
  }: {
    percent?: number;
    showInfo?: boolean;
    status?: string;
  }) => (
    <div role="progressbar" aria-valuenow={showInfo ? percent : undefined}>
      {showInfo ? `${percent}%` : null}
    </div>
  ),
}));

vi.mock("@/lib/native", () => ({
  native: {
    checkUpdate: h.checkUpdate,
    downloadUpdate: h.downloadUpdate,
    installDownloaded: h.installDownloaded,
    relaunch: h.relaunch,
  },
}));

import { useAppUpdater } from "./useAppUpdater";

beforeEach(() => {
  localStorage.clear();
  h.checkUpdate.mockReset();
  h.downloadUpdate.mockReset();
  h.installDownloaded.mockReset();
  h.relaunch.mockReset();
  h.confirm.mockReset();
  h.error.mockReset();
  h.checkUpdate.mockResolvedValue({ version: "1.0.0", notes: "Bug fixes" });
  h.downloadUpdate.mockResolvedValue(undefined);
  h.installDownloaded.mockResolvedValue(undefined);
  h.relaunch.mockResolvedValue(undefined);
});

describe("useAppUpdater", () => {
  it("downloads first, then installs after the user confirms", async () => {
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    const options = h.confirm.mock.calls[0][0];
    expect(options.title).toBe("发现新版本 1.0.0");
    const view = render(options.content);
    expect(view.getByText("Bug fixes")).toBeInTheDocument();
    expect(view.container.querySelector(".update-notes-scroll")).toContainElement(view.getByText("Bug fixes"));
    expect(view.container.querySelector(".update-skip")?.parentElement?.className).not.toContain("update-notes-scroll");

    await act(async () => {
      options.onOk();
    });

    expect(h.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(h.installDownloaded).not.toHaveBeenCalled();
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(2));
    expect(result.current.download).toBeNull();

    const install = h.confirm.mock.calls[1][0];
    expect(install.title).toBe("1.0.0 已下载");
    expect(install.okText).toBe("安装");
    await install.onOk();

    expect(h.installDownloaded).toHaveBeenCalledTimes(1);
    expect(h.relaunch).toHaveBeenCalledTimes(1);
    expect(h.error).not.toHaveBeenCalled();
  });

  it("shows the download error and does not install", async () => {
    h.downloadUpdate.mockRejectedValue("403 rate limit exceeded");
    renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    await act(async () => {
      h.confirm.mock.calls[0][0].onOk();
    });

    await waitFor(() => expect(h.error).toHaveBeenCalledTimes(1));
    expect(h.relaunch).not.toHaveBeenCalled();
    expect(h.installDownloaded).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith({
      title: "更新失败",
      content: "下载或安装更新时出错：403 rate limit exceeded",
      okText: "知道了",
    });
  });

  it("does not auto-open after this version is skipped, but the button still can", async () => {
    localStorage.setItem("zi-player-skip-update", "1.0.0");
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(result.current.update).toEqual({ version: "1.0.0", notes: "Bug fixes" }));
    expect(h.confirm).not.toHaveBeenCalled();

    result.current.openDialog(result.current.update!);
    expect(h.confirm).toHaveBeenCalledTimes(1);
  });

  it("remembers the version when skip is checked and the dialog is dismissed", async () => {
    const user = userEvent.setup();
    renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    const options = h.confirm.mock.calls[0][0];
    const view = render(options.content);
    await user.click(view.getByRole("checkbox", { name: "此版本不再提示" }));

    expect(localStorage.getItem("zi-player-skip-update")).toBe("1.0.0");
  });

  it("shows the saved skip choice when the dialog is opened again", async () => {
    localStorage.setItem("zi-player-skip-update", "1.0.0");
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(result.current.update).toEqual({ version: "1.0.0", notes: "Bug fixes" }));
    result.current.openDialog(result.current.update!);

    const view = render(h.confirm.mock.calls[0][0].content);
    expect(view.getByRole("checkbox", { name: "此版本不再提示" })).toBeChecked();
  });

  it("clears the skip when the checkbox is unchecked", async () => {
    const user = userEvent.setup();
    localStorage.setItem("zi-player-skip-update", "1.0.0");
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(result.current.update).toEqual({ version: "1.0.0", notes: "Bug fixes" }));
    result.current.openDialog(result.current.update!);
    const view = render(h.confirm.mock.calls[0][0].content);
    await user.click(view.getByRole("checkbox", { name: "此版本不再提示" }));

    expect(localStorage.getItem("zi-player-skip-update")).toBeNull();
  });

  it("reports download percent until the file finishes", async () => {
    let resolveDownload: () => void = () => {};
    h.downloadUpdate.mockImplementation((onProgress?: (loaded: number, total: number | null) => void) => {
      onProgress?.(40, 100);
      return new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
    });
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    act(() => {
      h.confirm.mock.calls[0][0].onOk();
    });

    await waitFor(() => expect(result.current.download).toEqual({ percent: 40 }));
    resolveDownload();
    await waitFor(() => expect(result.current.download).toBeNull());
  });

  it("keeps an unknown-size download without a percent", async () => {
    h.downloadUpdate.mockImplementation((onProgress?: (loaded: number, total: number | null) => void) => {
      onProgress?.(10, null);
      return new Promise<void>(() => {});
    });
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    act(() => {
      h.confirm.mock.calls[0][0].onOk();
    });

    await waitFor(() => expect(result.current.download).toEqual({ percent: null }));
  });

  it("reopens the install prompt from the button after it was dismissed", async () => {
    const { result } = renderHook(() => useAppUpdater());

    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    act(() => {
      h.confirm.mock.calls[0][0].onOk();
    });
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(2));

    result.current.openDialog(result.current.update!);
    expect(h.confirm).toHaveBeenCalledTimes(3);
    expect(h.confirm.mock.calls[2][0].okText).toBe("安装");
  });
});
