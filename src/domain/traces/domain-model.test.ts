import { describe, expect, it } from "vitest";
import type { Edge, Project } from "../model/project";
import { validateProject } from "../model/validate-project";
import { table } from "./format";

// Worked examples for docs/architecture/domain-model.md;
// format.ts explains the snapshots. Accept an intended change with
// `npx vitest run -u src/domain/traces/domain-model`,
// then check the guide still matches.

describe("traces", () => {
  it("validateProject: every problem, with a path to it", async () => {
    const edge = (from: string, to: string): Edge => ({
      id: `${from}->${to}`,
      from,
      to,
      latencyMs: 1,
      timeoutMs: 1000,
      retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
    });
    const project: Project = {
      id: "p",
      name: "A project with mistakes",
      architecture: {
        components: [
          { id: "api", type: "api-gateway", name: "API", config: {} },
          { id: "fn", type: "lambda", name: "Function", config: {} },
          { id: "db", type: "rds", name: "Database", config: {} },
        ],
        edges: [edge("api", "fn"), edge("fn", "db"), edge("fn", "cache")],
      },
      workflows: [
        {
          id: "get",
          name: "Get",
          root: {
            componentId: "api",
            action: "invoke",
            calls: [{ componentId: "db", action: "read" }],
          },
        },
      ],
      workloads: [
        {
          id: "load",
          name: "Load",
          durationMs: 60_000,
          seed: 1,
          mix: [{ workflowId: "gett", weight: 1 }],
          profile: [
            { atMs: 0, requestsPerSec: 100 },
            { atMs: 0, requestsPerSec: 200 },
          ],
        },
      ],
    };
    const rows = validateProject(project).map((issue) => [
      issue.path.join("."),
      issue.message,
    ]);
    await expect(
      table(
        [
          "Architecture: api -> fn -> db, plus an edge to a missing 'cache'.",
          "Workflow 'get' calls db straight from api. The workload has a typo",
          "in its mix and two profile points at 0 s.",
        ].join("\n"),
        ["path", "message"],
        rows,
      ),
    ).toMatchFileSnapshot("validate-project.txt");
  });
});
