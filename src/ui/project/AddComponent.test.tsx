// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { awsListComponentTypes } from "../../application/testing/aws-component-types";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { AddComponent } from "./AddComponent";

function renderAdd() {
  const onAdd = vi.fn<(type: string) => void>();
  const buttonRef = { current: null };
  render(
    <UseCasesProvider useCases={fakeUseCases()}>
      <AddComponent onAdd={onAdd} buttonRef={buttonRef} />
    </UseCasesProvider>,
  );
  return { onAdd, buttonRef };
}

function toggle(): HTMLElement {
  return screen.getByRole("button", { name: "Add component" });
}

function typeButtons(): HTMLElement[] {
  return screen
    .queryAllByRole("list", { name: "Component types" })
    .flatMap((list) => [...list.querySelectorAll("button")]);
}

describe("AddComponent", () => {
  afterEach(cleanup);

  // Fails if the list leaves out a registered type, or shows one without
  // its line on what it's for.
  it("lists every type with its line", () => {
    renderAdd();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle());

    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(typeButtons().map((b) => b.textContent)).toEqual(
      awsListComponentTypes()
        .execute()
        .map((c) => `${c.displayName}: ${String(c.purpose)}`),
    );
    expect(typeButtons()[0]?.textContent).toBe(
      "API Gateway: the front door; throttles requests over its rate.",
    );
  });

  // Fails if choosing a type doesn't add that type, leaves the list open,
  // or leaves the focus on a button that's gone, so Escape in Details
  // would have nothing to return to.
  it("adds the type chosen, and returns the focus to the button", () => {
    const { onAdd, buttonRef } = renderAdd();
    fireEvent.click(toggle());
    const dynamoDb = typeButtons().find((b) =>
      b.textContent.startsWith("DynamoDB"),
    );

    fireEvent.click(dynamoDb as HTMLElement);

    expect(onAdd.mock.calls).toEqual([["dynamodb"]]);
    expect(typeButtons()).toEqual([]);
    expect(document.activeElement).toBe(toggle());
    expect(buttonRef.current).toBe(toggle());
  });

  // Fails if Escape in the list doesn't close it, or the focus is lost.
  it("closes on Escape, with the focus on the button", () => {
    const { onAdd } = renderAdd();
    fireEvent.click(toggle());

    fireEvent.keyDown(typeButtons()[1] as HTMLElement, { key: "Escape" });

    expect(typeButtons()).toEqual([]);
    expect(document.activeElement).toBe(toggle());
    expect(onAdd).not.toHaveBeenCalled();
  });
});
