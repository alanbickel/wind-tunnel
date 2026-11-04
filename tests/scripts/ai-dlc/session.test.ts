import { describe, expect, it } from "vitest";
import {
  MAX_TURNS_PER_STEP,
  emptyTally,
  noteTurn,
  overTurnLimit,
} from "../../../scripts/ai-dlc/session.js";

const assistantEvent = (id: string, parentToolUseId: string | null = null) => ({
  type: "assistant",
  parent_tool_use_id: parentToolUseId,
  message: { id, content: [] },
});

describe("the driver's turn count", () => {
  // Fails if each event counts as a turn: one response with text and two tool
  // calls arrives as three events with the same message id.
  it("counts one model response once, however many events carry it", () => {
    const tally = emptyTally();
    for (const event of [
      assistantEvent("msg_1"),
      assistantEvent("msg_1"),
      assistantEvent("msg_2"),
    ])
      noteTurn(event, tally);
    expect(tally.turnIds.size).toBe(2);
  });

  // Fails if a subagent's responses count toward the main session's turns.
  it("leaves out a subagent's responses", () => {
    const tally = emptyTally();
    noteTurn(assistantEvent("msg_1", "toolu_1"), tally);
    expect(tally.turnIds.size).toBe(0);
  });

  // Fails if the limit ends a session at its last allowed turn, or lets it go past.
  it("is over the limit only past the last allowed turn", () => {
    const tally = emptyTally();
    for (let turn = 1; turn <= MAX_TURNS_PER_STEP; turn++)
      noteTurn(assistantEvent(`msg_${String(turn)}`), tally);
    expect(overTurnLimit(tally)).toBe(false);
    noteTurn(assistantEvent("msg_one_more"), tally);
    expect(overTurnLimit(tally)).toBe(true);
  });
});
