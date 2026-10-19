// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  afterEach(cleanup);

  // Fails if Button passes clicks through while unusable, or switches to
  // `disabled`, which drops the focus of a keyboard user who just pressed it.
  it("ignores clicks while unusable, and keeps its focus", () => {
    const onClick = vi.fn();
    render(
      <Button usable={false} onClick={onClick}>
        Run
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Run" });
    button.focus();

    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  // Fails if `usable` stops defaulting to true.
  it("clicks through by default", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
