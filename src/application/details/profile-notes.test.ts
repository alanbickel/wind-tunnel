import { describe, expect, it } from "vitest";
import { profileNotes } from "./profile-notes";

const NOTE =
  "After the run's end (45 s). Arrivals follow the line toward this point, and the run stops at 45 s.";

describe("profileNotes", () => {
  // Fails if a point past the duration goes without a note, a point at it
  // or before it gets one, or the note is on the wrong row.
  it("notes a point past the duration, and not one at it or before it", () => {
    const notes = profileNotes({
      durationMs: 45_000,
      profile: [
        { atMs: 0, requestsPerSec: 10 },
        { atMs: 30_000, requestsPerSec: 20 },
        { atMs: 45_000, requestsPerSec: 20 },
        { atMs: 45_001, requestsPerSec: 5 },
        { atMs: 60_000, requestsPerSec: 5 },
      ],
    });

    expect(notes).toEqual([undefined, undefined, undefined, NOTE, NOTE]);
  });

  // Fails if the run's end is worded from the point's time rather than the
  // run's duration.
  it("words the end from the duration", () => {
    const [note] = profileNotes({
      durationMs: 1_500,
      profile: [{ atMs: 2_000, requestsPerSec: 1 }],
    });

    expect(note).toContain("(1.5 s)");
    expect(note).toContain("stops at 1.5 s");
  });
});
