import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LibrarySidebar } from "./LibrarySidebar";

describe("LibrarySidebar", () => {
  it("shows the library entry and a disabled new-playlist action", () => {
    render(<LibrarySidebar itemCount={3} />);
    expect(screen.getByTestId("library-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("library-all")).toHaveTextContent("全部唱片");
    expect(screen.getByTestId("library-all")).toHaveTextContent("3");
    expect(screen.getByTestId("library-new-playlist")).toBeDisabled();
  });
});
