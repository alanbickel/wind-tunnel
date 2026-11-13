// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { awsListComponentTypes } from "../../application/testing/aws-component-types";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { ToolRail } from "./ToolRail";
import { useCanvasPanels } from "./useCanvasPanels";

/** The rail with the screen's panel state, and lists of one button each. */
function Harness({ onAdd }: { readonly onAdd: (type: string) => void }) {
  const panels = useCanvasPanels();
  const buttonRef = { current: null };
  return (
    <UseCasesProvider useCases={fakeUseCases()}>
      <button type="button">Canvas</button>
      <ToolRail
        panels={panels}
        adding={{ onAdd, buttonRef, announcement: "" }}
        workflows={<button type="button">Add workflow</button>}
        workloads={<button type="button">Add workload</button>}
        workflowAnnouncement=""
      />
    </UseCasesProvider>
  );
}

function renderRail() {
  const onAdd = vi.fn<(type: string) => void>();
  render(<Harness onAdd={onAdd} />);
  return { onAdd };
}

function railButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function typeButtons(): HTMLElement[] {
  return screen
    .queryAllByRole("list", { name: "Component types" })
    .flatMap((list) => [...list.querySelectorAll("button")]);
}

describe("ToolRail", () => {
  afterEach(cleanup);

  // Fails if a rail button loses its name or its tooltip, or the rail stops
  // being a toolbar with the four buttons in order.
  it("is a toolbar of four icon buttons, each with a name and a tooltip", () => {
    renderRail();

    const toolbar = screen.getByRole("toolbar", { name: "Tools" });
    const buttons = [...toolbar.querySelectorAll("button")];
    const names = ["Add component", "Connect", "Workflows", "Workloads"];
    expect(buttons.map((b) => b.textContent)).toEqual(names);
    expect(buttons.map((b) => b.title)).toEqual(names);
    expect(buttons.every((b) => b.querySelector("svg[aria-hidden]"))).toBe(
      true,
    );
  });

  // Fails if the list leaves out a registered type, or shows one without
  // its line on what it's for or its icon.
  it("lists every type with its line and its icon", () => {
    renderRail();
    expect(railButton("Add component").getAttribute("aria-expanded")).toBe(
      "false",
    );

    fireEvent.click(railButton("Add component"));

    expect(railButton("Add component").getAttribute("aria-expanded")).toBe(
      "true",
    );
    const expected = awsListComponentTypes().execute();
    // A button's name is its words; the icon is hidden from it.
    const named = expected.map((c) =>
      screen.getByRole("button", {
        name: `${c.displayName}: ${String(c.purpose)}`,
      }),
    );
    expect(typeButtons()).toEqual(named);
    expect(typeButtons().every((b) => b.querySelector("svg") !== null)).toBe(
      true,
    );
  });

  // Fails if choosing a type doesn't add that type, leaves the list open,
  // or leaves the focus off the button, so Escape in Details would have
  // nothing to return to.
  it("adds the type chosen, closing the list, the focus on the button", () => {
    const { onAdd } = renderRail();
    fireEvent.click(railButton("Add component"));

    fireEvent.click(screen.getByRole("button", { name: /^DynamoDB:/ }));

    expect(onAdd.mock.calls).toEqual([["dynamodb"]]);
    expect(typeButtons()).toEqual([]);
    expect(document.activeElement).toBe(railButton("Add component"));
  });

  // Fails if Escape in Add component's list doesn't close it, or the focus
  // isn't returned to its button.
  it("closes Add component on Escape, the focus back on its button", () => {
    const { onAdd } = renderRail();
    fireEvent.click(railButton("Add component"));

    fireEvent.keyDown(typeButtons()[1] as HTMLElement, { key: "Escape" });

    expect(typeButtons()).toEqual([]);
    expect(document.activeElement).toBe(railButton("Add component"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  // Fails if a click on the canvas leaves Add component's list open, or a
  // click inside the list closes it before a type is chosen.
  it("closes Add component on a click outside it, not inside", () => {
    renderRail();
    fireEvent.click(railButton("Add component"));

    fireEvent.mouseDown(typeButtons()[0] as HTMLElement);
    expect(typeButtons().length).toBeGreaterThan(0);

    fireEvent.mouseDown(railButton("Canvas"));
    expect(typeButtons()).toEqual([]);
    expect(railButton("Add component").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  // Fails if Connect's hint leaves out the drag or the keyboard's way, or
  // doesn't close on Escape or on a click outside it.
  it("opens Connect's hint with both ways to connect, and closes it", () => {
    renderRail();
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();

    fireEvent.click(railButton("Connect"));
    const hint = screen.getByRole("region", { name: "Connect" });
    expect(hint.textContent).toContain("Drag from a box’s handle");
    expect(hint.textContent).toContain("“Connect to…” in its Details");

    fireEvent.keyDown(hint, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();
    expect(document.activeElement).toBe(railButton("Connect"));

    fireEvent.click(railButton("Connect"));
    fireEvent.mouseDown(railButton("Canvas"));
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();
  });

  // Fails if Workflows and Workloads share a list, or lose their own Add
  // buttons, or a list closes when the canvas is clicked, which would end
  // a pick through its rows.
  it("opens Workflows and Workloads as separate lists that stay open", () => {
    renderRail();

    fireEvent.click(railButton("Workflows"));
    fireEvent.mouseDown(railButton("Canvas"));
    expect(railButton("Add workflow")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add workload" })).toBeNull();

    fireEvent.click(railButton("Workloads"));
    expect(railButton("Add workload")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add workflow" })).toBeNull();
  });

  // Fails if opening one rail panel leaves another open, or Escape in a list
  // doesn't close it with the focus on its button.
  it("opens one panel at a time, and closes a list on Escape", () => {
    renderRail();
    fireEvent.click(railButton("Add component"));
    fireEvent.click(railButton("Connect"));
    expect(typeButtons()).toEqual([]);
    fireEvent.click(railButton("Workflows"));
    expect(screen.queryByRole("region", { name: "Connect" })).toBeNull();

    fireEvent.keyDown(railButton("Add workflow"), { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Add workflow" })).toBeNull();
    expect(document.activeElement).toBe(railButton("Workflows"));
  });
});
