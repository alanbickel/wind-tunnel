import { describe, expect, it } from "vitest";
import { inSentence } from "./in-sentence";

describe("inSentence", () => {
  // Fails if inSentence stops lowercasing the first letter of a word that
  // isn't in capitals.
  it("lowercases the first letter of a sentence-case word", () => {
    expect(inSentence("Query workers")).toBe("query workers");
  });

  // Fails if inSentence lowercases a first word in capitals.
  it("leaves a first word in capitals as it is", () => {
    expect(inSentence("RDS proxy")).toBe("RDS proxy");
  });
});
