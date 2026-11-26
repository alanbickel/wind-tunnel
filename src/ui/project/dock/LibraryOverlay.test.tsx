// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { awsListComponentTypes } from "../../../application/testing/aws-component-types";
import { fakeUseCases } from "../../app/testing/fake-use-cases";
import { UseCasesProvider } from "../../app/UseCasesProvider";
import { LibraryOverlay } from "./LibraryOverlay";
import type { OverlayProps } from "./overlay";

/** The tab, with a spy for what it adds. */
function renderTab() {
  const onAdd = vi.fn<(type: string) => void>();
  const props = { onAdd } as Partial<OverlayProps> as OverlayProps;
  render(
    <UseCasesProvider useCases={fakeUseCases()}>
      <LibraryOverlay {...props} />
    </UseCasesProvider>,
  );
  return { onAdd };
}

function cards(): HTMLButtonElement[] {
  return screen.getAllByRole("button");
}

describe("LibraryOverlay", () => {
  afterEach(cleanup);

  // Fails if the tab leaves out a registered type, or shows one without
  // its line on what it's for or its icon.
  it("has a card per type, with its name, its line, and its icon", () => {
    renderTab();

    const expected = awsListComponentTypes()
      .execute()
      .flatMap((group) => group.types);
    // A button's name is its words; the icon is hidden from it.
    const named = expected.map((c) =>
      screen.getByRole("button", {
        name: `${c.displayName} ${String(c.purpose)}`,
      }),
    );
    expect(cards()).toEqual(named);
    expect(cards().every((b) => b.querySelector("svg") !== null)).toBe(true);
  });

  // Fails if a category loses its h4 heading, or its list isn't named by
  // it, or holds other cards than the category's.
  it("shows each category as an h4 over the list it names", () => {
    renderTab();

    const groups = awsListComponentTypes().execute();
    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((h) => h.textContent)).toEqual(
      groups.map((g) => g.heading),
    );
    groups.forEach((group) => {
      const list = screen.getByRole("list", { name: group.heading });
      const names = [...list.querySelectorAll("button")].map(
        (b) => b.querySelector("span span")?.textContent,
      );
      expect(names).toEqual(group.types.map((t) => t.displayName));
    });
  });

  // Fails if the group of types with no category loses its list's name, gets
  // an h4, or drops its cards.
  it("shows types with no category in a named list with no heading", () => {
    const listComponentTypes = {
      execute: () => [
        {
          heading: undefined,
          types: [{ type: "rds", displayName: "RDS", purpose: undefined }],
        },
      ],
    };
    render(
      <UseCasesProvider useCases={fakeUseCases({ listComponentTypes })}>
        <LibraryOverlay
          {...({ onAdd: vi.fn() } as Partial<OverlayProps> as OverlayProps)}
        />
      </UseCasesProvider>,
    );

    const other = screen.getByRole("list", { name: "Other component types" });

    expect(
      [...other.querySelectorAll("button")].map(
        (b) => b.querySelector("span span")?.textContent,
      ),
    ).toEqual(["RDS"]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(
      screen.getAllByRole("list").length - 1,
    );
  });

  // Fails if clicking a card doesn't add that type, or adds it more than once.
  it("adds the type of the card clicked", () => {
    const { onAdd } = renderTab();

    fireEvent.click(screen.getByRole("button", { name: /^DynamoDB / }));

    expect(onAdd.mock.calls).toEqual([["dynamodb"]]);
  });

  // Fails if a card stops being a native button, which Enter and Space
  // press, and becomes something the keyboard can't use.
  it("makes each card a button the keyboard can press", () => {
    renderTab();

    expect(
      cards().every((b) => b.tagName === "BUTTON" && b.type === "button"),
    ).toBe(true);
  });
});
