// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DiagramNode, DiagramStatus } from "./diagram-model";
import { NodeCard } from "./NodeCard";

afterEach(cleanup);

const node: DiagramNode = {
  id: "db",
  label: "orders-db",
  caption: "RDS",
  icon: "rds",
  position: { x: 0, y: 0 },
};

function cardWith(status: DiagramStatus | undefined) {
  return render(<NodeCard node={{ ...node, status }} />);
}

describe("NodeCard", () => {
  // Fails if the card drops the name or the type in words, or shows a badge
  // with no run.
  it("shows the name and the type, and no badge without a status", () => {
    const { container } = cardWith(undefined);

    expect(screen.getByText("orders-db")).toBeTruthy();
    expect(screen.getByText("RDS", { selector: "small" })).toBeTruthy();
    expect(container.querySelector("[data-status]")).toBeNull();
  });

  // Fails if the badge's shape is chosen by color alone: each status must
  // draw its own element, and say its word.
  it.each([
    ["ok", "circle"],
    ["waited", "polygon"],
    ["refused", "rect"],
  ] as const)("draws %s as a %s, with its word", (kind, shape) => {
    const { container } = cardWith({ kind, word: kind, outOfDate: false });

    const badge = container.querySelector(`[data-status="${kind}"]`);
    expect(badge?.textContent).toBe(kind);
    expect(badge?.querySelector(shape)).not.toBeNull();
    expect(badge?.hasAttribute("data-out-of-date")).toBe(false);
  });

  // Fails if an out-of-date badge looks like a current one, or a screen
  // reader isn't told it's from an earlier version.
  it("draws an out-of-date badge hollow, and says why to a screen reader", () => {
    const { container } = cardWith({
      kind: "refused",
      word: "refused",
      outOfDate: true,
    });

    const badge = container.querySelector('[data-status="refused"]');
    expect(badge?.hasAttribute("data-out-of-date")).toBe(true);
    expect(badge?.textContent).toBe(
      "refused, from an earlier version of the project",
    );
  });

  // Fails if the icon is announced: the type's words already say it.
  it("hides the icon from screen readers", () => {
    const { container } = cardWith(undefined);

    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});
