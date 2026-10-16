import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { validateComponents } from "../../domain/components/validate-components";
import { validateProject } from "../../domain/model/validate-project";
import { sampleRecord } from "./sample-record";

describe("sampleRecord", () => {
  it("is a valid project for the AWS registry", () => {
    expect(validateProject(sampleRecord.project)).toEqual([]);
    expect(
      validateComponents(sampleRecord.project, createAwsComponentRegistry()),
    ).toEqual([]);
  });
});
