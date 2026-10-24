import { describe, expect, it } from "vitest";
import tokensCss from "../theme/tokens.css?raw";
import { WIDE_WINDOW_QUERY } from "./useWideWindow";

describe("WIDE_WINDOW_QUERY", () => {
  // Fails if --breakpoint-wide changes and the query doesn't: the tabs
  // would show in a window the stylesheets lay out as one column.
  it("is the --breakpoint-wide token's width", () => {
    const token = /--breakpoint-wide:\s*([^;]+);/.exec(tokensCss)?.[1];

    expect(WIDE_WINDOW_QUERY).toBe(`(min-width: ${String(token)})`);
  });
});
