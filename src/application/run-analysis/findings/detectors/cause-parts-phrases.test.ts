import { describe, expect, it } from "vitest";
import { checkPhrases } from "../../../testing/check-phrases";
import { CAUSE_PHRASES } from "./cause-parts-phrases";
import { LIMIT_REFUSED_PHRASES } from "./limit-refused-phrases";

describe("cause-parts' phrases", () => {
  // Fails if a phrase's long or short form is worded other than its case
  // says, a long form loses its closing period or a short form gains one,
  // or a kind the table registers has no case here.
  it("words every case at both lengths", () => {
    expect(
      checkPhrases({
        phrases: CAUSE_PHRASES,
        shared: [LIMIT_REFUSED_PHRASES],
        cases: [
          {
            name: "a timeout",
            statement: { kind: "caller-stopped-waiting", componentId: "fn" },
            long: "The caller stopped waiting for fn. No limit explains a timeout, so the run can't say why it was slow.",
            short:
              "the caller stopped waiting for fn, and no limit explains why it was slow",
          },
        ],
      }),
    ).toEqual([]);
  });
});
