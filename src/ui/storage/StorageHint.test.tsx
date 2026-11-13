// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PersistenceStatus } from "../../application/ports/storage-persistence";
import { StorageHint } from "./StorageHint";

/** The hint with the dismissal state the app keeps for it. */
function Harness(props: { readonly status: PersistenceStatus }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <StorageHint
      storage={{
        status: props.status,
        requestOnce: () => undefined,
        dismissed,
        dismiss: () => {
          setDismissed(true);
        },
      }}
    />
  );
}

describe("StorageHint", () => {
  afterEach(cleanup);

  // Fails if the strip draws anything, even a bare bar, when storage is fine.
  it("leaves the live region empty when the browser keeps the projects", () => {
    render(<Harness status="persisted" />);

    expect(screen.getByRole("status").innerHTML).toBe("");
  });

  // Fails if Dismiss drops the focus to the page body with the button.
  it("keeps the focus on the page when Dismiss removes its own button", () => {
    render(<Harness status="best-effort" />);
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    dismiss.focus();

    fireEvent.click(dismiss);

    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });
});
