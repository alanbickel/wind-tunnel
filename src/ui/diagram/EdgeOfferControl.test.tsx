// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EdgeOffer, OfferQuestion } from "./diagram-model";
import { EdgeOfferControl } from "./EdgeOfferControl";

const LABEL = "Add a call from A to B";

function renderOffer(onUse: () => OfferQuestion | undefined) {
  const offer: EdgeOffer = { edgeId: "a-b", label: LABEL, onUse };
  const onKeyDown = vi.fn();
  render(
    <div onKeyDown={onKeyDown}>
      <EdgeOfferControl offer={offer} />
    </div>,
  );
  return { button: screen.getByRole("button", { name: LABEL }), onKeyDown };
}

const asksSomething: OfferQuestion = (close) => (
  <button type="button" onClick={close}>
    Nevermind
  </button>
);

describe("EdgeOfferControl", () => {
  afterEach(cleanup);

  // Fails if the button isn't named for what it does, or has no tooltip
  // saying so: a "+" alone says nothing to a screen reader or a pointer.
  it("is a button named for what it does, with the same tooltip", () => {
    const { button } = renderOffer(() => undefined);

    expect(button.getAttribute("title")).toBe(LABEL);
    expect(button.textContent).toBe("+");
  });

  // Fails if using an offer that needs no question opens a popover, or
  // doesn't call the offer exactly once.
  it("uses the offer and opens nothing when it asks no question", () => {
    const onUse = vi.fn(() => undefined);
    const { button } = renderOffer(onUse);

    fireEvent.click(button);

    expect(onUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: LABEL })).toBeNull();
  });

  // Fails if the question isn't drawn in a group named for the offer, or
  // the button doesn't say it has opened something (aria-expanded).
  it("opens the question in a group named for the offer", () => {
    const { button } = renderOffer(() => asksSomething);

    fireEvent.click(button);

    expect(screen.getByRole("group", { name: LABEL })).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  // Fails if Escape leaves the question open, lets Escape through to what
  // is around the control (the canvas would clear its selection), or loses
  // the focus from the button.
  it("closes on Escape, returns the focus to the button, and stops the key there", () => {
    const { button, onKeyDown } = renderOffer(() => asksSomething);
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole("button", { name: "Nevermind" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("group", { name: LABEL })).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  // Fails if the question can't close itself once answered, or any other key
  // closes it.
  it("closes when the question closes it, and not on another key", () => {
    const { button } = renderOffer(() => asksSomething);
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole("button", { name: "Nevermind" }), {
      key: "a",
    });
    expect(screen.getByRole("group", { name: LABEL })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nevermind" }));

    expect(screen.queryByRole("group", { name: LABEL })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  // Fails if pressing the button again while the question is open asks
  // another (or uses the offer again) instead of closing it.
  it("closes the question when the button is pressed again, without using the offer twice", () => {
    const onUse = vi.fn(() => asksSomething);
    const { button } = renderOffer(onUse);
    fireEvent.click(button);

    fireEvent.click(button);

    expect(screen.queryByRole("group", { name: LABEL })).toBeNull();
    expect(onUse).toHaveBeenCalledTimes(1);
  });
});
