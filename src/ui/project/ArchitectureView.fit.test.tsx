// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../../application/testing/sample-record";
import { fakeUseCases } from "../app/testing/fake-use-cases";
import { UseCasesProvider } from "../app/UseCasesProvider";
import { fitOptions } from "../diagram/fit-options";
import { stubDiagramBrowserApis } from "../diagram/testing/stub-diagram-browser-apis";
import { preloadBeforeAll } from "../shared/testing/preload-before-all";
import { ArchitectureView } from "./ArchitectureView";

const fitView = vi.fn(() => Promise.resolve(true));
const zoomIn = vi.fn(() => Promise.resolve(true));
const zoomOut = vi.fn(() => Promise.resolve(true));

// React Flow calls its own fitView inside; only the canvas's goes to the spy.
vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useReactFlow: () => ({ fitView, zoomIn, zoomOut }),
}));

/** The view of the sample, with spies for what it reports. */
function View() {
  return (
    <ArchitectureView
      record={sampleRecord}
      selection={undefined}
      onSelect={vi.fn()}
      onClear={vi.fn()}
      onConnect={vi.fn()}
      onMove={vi.fn()}
      offering={{ onEdit: vi.fn(), onSelect: vi.fn(), announce: vi.fn() }}
    />
  );
}

describe("ArchitectureView's fit", () => {
  preloadBeforeAll(() => import("../diagram/DiagramCanvas"));
  beforeEach(stubDiagramBrowserApis);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Fails if the view stops passing the rail's inset to the diagram (the
  // rail's onInset, or Drawing's fitLeftInsetPx, unwired): Fit would put
  // the left boxes under the rail.
  it("fits clear of the tool rail", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(16);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(48);
    render(
      <UseCasesProvider useCases={fakeUseCases()}>
        <View />
      </UseCasesProvider>,
    );
    const rail = screen.getByRole("toolbar", { name: "Tools" });
    const fit = within(rail).getByRole("button", { name: "Fit to screen" });
    await waitFor(() => {
      expect(fit.getAttribute("aria-disabled")).toBe("false");
    });
    fitView.mockClear();

    fireEvent.click(fit);

    expect(fitView).toHaveBeenCalledExactlyOnceWith(fitOptions(80));
  });
});
