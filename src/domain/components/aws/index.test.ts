import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "./index";

describe("createAwsComponentRegistry", () => {
  it("registers the five MVP types with valid defaults", () => {
    const types = createAwsComponentRegistry().list();
    expect(types.map((t) => t.type)).toEqual([
      "api-gateway",
      "lambda",
      "dynamodb",
      "rds",
      "sqs",
    ]);
    for (const type of types) {
      expect(type.checkConfig(type.defaultConfig)).toEqual([]);
    }
    expect(types.filter((t) => t.deliversAsync).map((t) => t.type)).toEqual([
      "sqs",
    ]);
  });
});
