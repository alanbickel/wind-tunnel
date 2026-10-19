// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "./Breadcrumb";

describe("Breadcrumb", () => {
  afterEach(cleanup);

  // Fails if the project list's crumb becomes a button, which would go
  // nowhere, or loses aria-current.
  it("marks Projects as the current page on the project list", () => {
    render(<Breadcrumb projectName={undefined} onProjects={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
    const current = screen.getByRole("listitem");
    expect(current.textContent).toBe("Projects");
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  // Fails if the separator loses aria-hidden, so screen readers read "›"
  // as part of the project's name.
  it("marks the open project as the current page, after Projects", () => {
    render(<Breadcrumb projectName="Checkout" onProjects={vi.fn()} />);

    const [projects, current] = screen.getAllByRole("listitem");
    expect(projects?.textContent).toBe("Projects");
    expect(current?.getAttribute("aria-current")).toBe("page");
    expect(current?.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "›",
    );
  });

  // Fails if the Projects button isn't wired to onProjects.
  it("goes back to the project list from Projects", () => {
    const onProjects = vi.fn();
    render(<Breadcrumb projectName="Checkout" onProjects={onProjects} />);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    expect(onProjects).toHaveBeenCalledOnce();
  });
});
