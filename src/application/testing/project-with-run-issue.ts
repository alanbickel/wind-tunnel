import type { Project } from "../../domain/model/project";
import { sampleRecord } from "./sample-record";

/**
 * The sample project with a workload that can't run: "Write rush" runs
 * "Write item", whose function writes to `orders-db`, which isn't in the
 * architecture. Its architecture is still valid, so it saves and opens, and
 * its first workload, "Steady", still runs.
 */
export const projectWithRunIssue: Project = {
  ...sampleRecord.project,
  workflows: [
    ...sampleRecord.project.workflows,
    {
      id: "write",
      name: "Write item",
      root: {
        componentId: "api",
        action: "invoke",
        calls: [
          {
            componentId: "fn",
            action: "invoke",
            calls: [{ componentId: "orders-db", action: "write" }],
          },
        ],
      },
    },
  ],
  workloads: [
    ...sampleRecord.project.workloads,
    {
      id: "write-rush",
      name: "Write rush",
      durationMs: 5_000,
      seed: 1,
      mix: [{ workflowId: "write", weight: 1 }],
      profile: [{ atMs: 0, requestsPerSec: 20 }],
    },
  ],
};
