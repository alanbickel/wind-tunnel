// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

type Fruit = "apple" | "banana" | "cherry";

function Fruits() {
  const [selected, setSelected] = useState<Fruit>("banana");
  return (
    <Tabs
      label="Fruit"
      selected={selected}
      onSelect={setSelected}
      tabs={[
        { id: "apple", label: "Apple", content: <p>Apple panel</p> },
        { id: "banana", label: "Banana", content: <p>Banana panel</p> },
        { id: "cherry", label: "Cherry", content: <p>Cherry panel</p> },
      ]}
    />
  );
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name });
}

/** The tab with the focus, and the one panel showing, by their text. */
function showing(): [string | null | undefined, string | null] {
  return [
    document.activeElement?.textContent,
    screen.getByRole("tabpanel").textContent,
  ];
}

describe("Tabs", () => {
  afterEach(cleanup);

  // Fails if the selected tab loses aria-selected or its tab stop, an
  // unselected tab keeps a tab stop (one Tab press would land on it), or
  // a panel isn't labelled by its tab.
  it("shows the selected tab's panel, and gives only that tab a tab stop", () => {
    render(<Fruits />);

    expect(screen.getByRole("tablist", { name: "Fruit" })).toBeTruthy();
    expect(tab("Banana").getAttribute("aria-selected")).toBe("true");
    expect(tab("Apple").getAttribute("aria-selected")).toBe("false");
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([
      -1, 0, -1,
    ]);
    const panel = screen.getByRole("tabpanel", { name: "Banana" });
    expect(panel.textContent).toBe("Banana panel");
    expect(panel.tabIndex).toBe(0);
  });

  // Fails if a movement key stops selecting the tab it lands on, stops
  // moving the focus there, or doesn't wrap at either end.
  it("moves between tabs with the arrow keys, Home, and End", () => {
    render(<Fruits />);
    tab("Banana").focus();

    fireEvent.keyDown(tab("Banana"), { key: "ArrowRight" });
    expect(showing()).toEqual(["Cherry", "Cherry panel"]);
    fireEvent.keyDown(tab("Cherry"), { key: "ArrowRight" });
    expect(showing()).toEqual(["Apple", "Apple panel"]);
    fireEvent.keyDown(tab("Apple"), { key: "ArrowLeft" });
    expect(showing()).toEqual(["Cherry", "Cherry panel"]);
    fireEvent.keyDown(tab("Cherry"), { key: "Home" });
    expect(showing()).toEqual(["Apple", "Apple panel"]);
    fireEvent.keyDown(tab("Apple"), { key: "End" });
    expect(showing()).toEqual(["Cherry", "Cherry panel"]);
  });

  it("selects a tab when it's clicked", () => {
    render(<Fruits />);

    fireEvent.click(tab("Apple"));

    expect(screen.getByRole("tabpanel").textContent).toBe("Apple panel");
  });

  // Fails if Tabs unmounts the panels it hides: their state would be lost.
  it("keeps hidden panels mounted", () => {
    render(<Fruits />);

    const panels = screen.getAllByRole("tabpanel", { hidden: true });

    expect(panels.map((panel) => panel.hidden)).toEqual([true, false, true]);
    expect(panels[0]?.textContent).toBe("Apple panel");
  });

  // Fails if Tabs swallows keys it doesn't use, such as Tab or Enter.
  it("leaves other keys alone", () => {
    render(<Fruits />);

    const passed = fireEvent.keyDown(tab("Banana"), { key: "Tab" });

    expect(passed).toBe(true);
    expect(tab("Banana").getAttribute("aria-selected")).toBe("true");
  });
});
