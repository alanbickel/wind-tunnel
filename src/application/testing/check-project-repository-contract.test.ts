import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../ports/project-record";
import { checkProjectRepositoryContract } from "./check-project-repository-contract";
import { InMemoryProjectRepository } from "./in-memory-project-repository";
import { sampleRecord } from "./sample-record";

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
