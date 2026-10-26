import { describe, expect, it } from "vitest";
import { checkNumberDraft, type NumberRule } from "./number-draft";

const QUERY_WORKERS: NumberRule = {
  subject: "Query workers",
  wholeNumber: true,
  range: { min: 1, minExclusive: false, max: undefined },
};

const RATE: NumberRule = {
  subject: "Rate",
  wholeNumber: false,
  range: { min: 0, minExclusive: true, max: undefined },
};

const CONSUMERS: NumberRule = {
  subject: "Consumer concurrency",
  wholeNumber: true,
  range: { min: 2, minExclusive: false, max: 1_000 },
};

/** The message for a draft, or undefined if it passes. */
function messageFor(text: string, rule: NumberRule): string | undefined {
  const check = checkNumberDraft(text, rule);
  return check.status === "fails" ? check.message : undefined;
}

describe("checkNumberDraft", () => {
  // Fails if a draft in range doesn't pass, or separators and spaces
  // aren't read: "10,000" would fail as not a number.
  it.each([
    ["64", QUERY_WORKERS, 64],
    [" 10,000 ", RATE, 10_000],
    ["0.5", RATE, 0.5],
    ["1,000", CONSUMERS, 1_000],
  ])("reads %j as a number in range", (text, rule, value) => {
    expect(checkNumberDraft(text, rule)).toEqual({ status: "passes", value });
  });

  // Fails if a message reads as Zod's ("Too small: expected number to be
  // >=1") rather than the user's, or a rule goes unchecked, or a comma
  // that isn't a thousands separator is dropped: "1,5" would pass as 15.
  it.each([
    ["0", QUERY_WORKERS, "Query workers must be at least 1."],
    ["", QUERY_WORKERS, "Query workers must be a whole number."],
    ["lots", RATE, "Rate must be a number."],
    ["1,5", RATE, "Rate must be a number."],
    ["10,00", RATE, "Rate must be a number."],
    ["1,0000", CONSUMERS, "Consumer concurrency must be a whole number."],
    ["16.5", QUERY_WORKERS, "Query workers must be a whole number."],
    ["0", RATE, "Rate must be more than 0."],
    ["1001", CONSUMERS, "Consumer concurrency must be at most 1,000."],
  ])("words what's wrong with %j", (text, rule, message) => {
    expect(messageFor(text, rule)).toBe(message);
  });
});
