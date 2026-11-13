import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReleaseNotes } from "./ReleaseNotes";

const notes = `## ZI Player 1.1.0

### 新增

- 删除歌曲时清理缓存。

**完整更新日志：** https://github.com/awrff/zi-player/compare/v1.0.0...v1.1.0`;

describe("ReleaseNotes", () => {
  it("renders headings, lists, bold text, and links", () => {
    const view = render(<ReleaseNotes text={notes} />);
    expect(view.getByRole("heading", { name: "ZI Player 1.1.0" })).toBeInTheDocument();
    expect(view.getByRole("heading", { name: "新增" })).toBeInTheDocument();
    expect(view.getByRole("listitem")).toHaveTextContent("删除歌曲时清理缓存。");
    expect(view.getByText("完整更新日志：").tagName).toBe("STRONG");
    expect(view.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/awrff/zi-player/compare/v1.0.0...v1.1.0",
    );
  });
});
