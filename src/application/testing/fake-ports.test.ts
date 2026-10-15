import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { validateComponents } from "../../domain/components/validate-components";
import { validateProject } from "../../domain/model/validate-project";
import type { ProjectSummary } from "../ports/project-record";
import { checkProjectRepositoryContract } from "./check-project-repository-contract";
import {
  FixedClock,
  InMemoryProjectRepository,
  SequentialIds,
} from "./fake-ports";
import { sampleRecord } from "./sample-record";

describe("sampleRecord", () => {
  it("is a valid project for the AWS registry", () => {
    expect(validateProject(sampleRecord.project)).toEqual([]);
    expect(
      validateComponents(sampleRecord.project, createAwsComponentRegistry()),
    ).toEqual([]);
  });
});

describe("InMemoryProjectRepository", () => {
  it("passes the repository contract", async () => {
    expect(
      await checkProjectRepositoryContract(
        new InMemoryProjectRepository(),
        sampleRecord,
      ),
    ).toEqual([]);
  });
});

describe("checkProjectRepositoryContract", () => {
  it("reports a repository that lists projects oldest first", async () => {
    class OldestFirst extends InMemoryProjectRepository {
      override async list(): Promise<ProjectSummary[]> {
        return (await super.list()).reverse();
      }
    }
    expect(
      await checkProjectRepositoryContract(new OldestFirst(), sampleRecord),
    ).toEqual([
      "list returns one summary per project, most recently updated first",
      "a deleted project is no longer listed, and the others are",
    ]);
  });

  it("reports a repository that drops document-only fields", async () => {
    class ForgetsLayout extends InMemoryProjectRepository {
      override save(record: Parameters<InMemoryProjectRepository["save"]>[0]) {
        return super.save({ ...record, layout: { nodes: {} } });
      }
    }
    expect(
      await checkProjectRepositoryContract(new ForgetsLayout(), sampleRecord),
    ).toEqual([
      "get returns a saved record unchanged",
      "saving a record with an existing ID replaces it",
    ]);
  });
});

describe("FixedClock", () => {
  it("returns the time it was given until moved", () => {
    const clock = new FixedClock("2026-10-15T09:30:00.000Z");
    expect(clock.now()).toBe("2026-10-15T09:30:00.000Z");
    clock.set("2026-10-15T10:00:00.000Z");
    expect(clock.now()).toBe("2026-10-15T10:00:00.000Z");
  });
});

describe("SequentialIds", () => {
  it("counts up from 1 with its prefix", () => {
    const ids = new SequentialIds("project");
    expect([ids.newId(), ids.newId()]).toEqual(["project-1", "project-2"]);
  });
});
