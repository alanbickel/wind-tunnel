import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { loadProject } from "./load-project";

const registry = createAwsComponentRegistry();

/** A small valid document: api -> fn -> queue, with async work on fn. */
function document(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "p1",
    name: "Orders",
    description: "A test project",
    createdAt: "2026-10-14T12:00:00Z",
    updatedAt: "2026-10-14T12:30:00.000+02:00",
    source: { templateId: "template-a", templateVersion: 1 },
    architecture: {
      components: [
        {
          id: "api",
          type: "api-gateway",
          name: "API",
          config: {
            ratePerSec: 100,
            burst: 10,
            overhead: { kind: "constant", valueMs: 10 },
          },
        },
        {
          id: "fn",
          type: "lambda",
          name: "Function",
          config: {
            concurrency: 10,
            coldStart: { kind: "constant", valueMs: 300 },
            idleTimeoutSec: 600,
            computeTime: { kind: "constant", valueMs: 20 },
          },
        },
        {
          id: "queue",
          type: "sqs",
          name: "Queue",
          config: {
            consumerMaxConcurrency: 2,
            sendLatency: { kind: "constant", valueMs: 5 },
          },
        },
      ],
      edges: [edge("api", "fn"), edge("fn", "queue"), edge("queue", "fn")],
    },
    workflows: [
      {
        id: "create",
        name: "Create order",
        root: {
          componentId: "api",
          action: "invoke",
          calls: [
            {
              componentId: "fn",
              action: "invoke",
              calls: [
                {
                  componentId: "queue",
                  action: "enqueue",
                  async: { componentId: "fn", action: "invoke" },
                },
              ],
            },
          ],
        },
      },
    ],
    workloads: [
      {
        id: "steady",
        name: "Steady",
        durationSec: 60,
        seed: 42,
        mix: [{ workflowId: "create", weight: 1 }],
        profile: [{ atSec: 0, requestsPerSec: 50 }],
      },
    ],
    layout: { nodes: { api: { x: 0, y: 0 }, fn: { x: 200, y: 0 } } },
  };
}

function edge(from: string, to: string) {
  return {
    id: `${from}->${to}`,
    from,
    to,
    latencyMs: 1,
    timeoutMs: 1_000,
    retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
  };
}

/** Sets `value` at `path` inside `target`; the parents must exist. */
function set(target: unknown, path: (string | number)[], value: unknown) {
  let node = target as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    node = node[key] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1];
  if (last === undefined) throw new Error("empty path");
  node[last] = value;
}

const issuesFor = (input: unknown) => {
  const result = loadProject(input, registry);
  return result.ok ? [] : result.issues;
};

describe("loadProject", () => {
  it("maps a valid document to the domain, leaving document-only fields out", () => {
    const result = loadProject(document(), registry);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { project } = result;
    expect(Object.keys(project).sort()).toEqual([
      "architecture",
      "description",
      "id",
      "name",
      "workflows",
      "workloads",
    ]);
    expect(project.workflows[0]?.root.calls?.[0]?.calls?.[0]).toEqual({
      componentId: "queue",
      action: "enqueue",
      async: { componentId: "fn", action: "invoke" },
    });
    expect(result.document.layout.nodes["fn"]).toEqual({ x: 200, y: 0 });
  });

  it("converts workload times from the document's seconds to milliseconds", () => {
    const doc = document();
    set(
      doc,
      ["workloads", 0, "profile"],
      [
        { atSec: 0, requestsPerSec: 50 },
        { atSec: 1.5, requestsPerSec: 80 },
      ],
    );
    const result = loadProject(doc, registry);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const workload = result.project.workloads[0];
    expect(workload?.durationMs).toBe(60_000);
    expect(workload?.profile).toEqual([
      { atMs: 0, requestsPerSec: 50 },
      { atMs: 1_500, requestsPerSec: 80 },
    ]);
  });

  it("reports issues in renamed fields at the document's field name", () => {
    const doc = document();
    set(
      doc,
      ["workloads", 0, "profile"],
      [
        { atSec: 2, requestsPerSec: 50 },
        { atSec: 1, requestsPerSec: 50 },
      ],
    );
    expect(issuesFor(doc)).toEqual([
      {
        path: ["workloads", 0, "profile", 1, "atSec"],
        message: "Profile times must increase; 1 s comes after 2 s.",
      },
    ]);
  });

  it("refuses an unknown schema version, or something that isn't a project", () => {
    const newer = document();
    newer["schemaVersion"] = 2;
    expect(issuesFor(newer)).toEqual([
      {
        path: ["schemaVersion"],
        message:
          "Unsupported schema version 2; this version of Wind Tunnel reads version 1.",
      },
    ]);
    expect(issuesFor("hello")[0]?.message).toMatch(/no schemaVersion/);
  });

  it("reports every shape problem with its path", () => {
    const doc = document();
    set(doc, ["architecture", "edges", 0, "timeoutMs"], 0);
    set(doc, ["workloads", 0, "seed"], -1);
    set(doc, ["createdAt"], "yesterday");
    expect(issuesFor(doc).map((i) => i.path)).toEqual([
      ["createdAt"],
      ["architecture", "edges", 0, "timeoutMs"],
      ["workloads", 0, "seed"],
    ]);
  });

  it("rejects unknown keys, so typos in templates are caught", () => {
    const doc = document();
    set(doc, ["architecture", "edges", 1, "latencyMS"], 5);
    const issues = issuesFor(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(["architecture", "edges", 1]);
    expect(issues[0]?.message).toMatch(/latencyMS/);
  });

  it("checks nested steps", () => {
    const doc = document();
    set(
      doc,
      ["workflows", 0, "root", "calls", 0, "calls", 0, "async", "action"],
      "delete",
    );
    expect(issuesFor(doc).map((i) => i.path)).toEqual([
      ["workflows", 0, "root", "calls", 0, "calls", 0, "async", "action"],
    ]);
  });

  it("then checks rules across the project", () => {
    const doc = document();
    const architecture = doc["architecture"] as { edges: unknown[] };
    architecture.edges.splice(2, 1); // queue -> fn
    expect(issuesFor(doc)).toEqual([
      {
        path: ["workflows", 0, "root", "calls", 0, "calls", 0, "async"],
        message: expect.stringMatching(/queue.*fn/) as unknown,
      },
    ]);
  });

  it("then checks each component's type and config", () => {
    const doc = document();
    set(doc, ["architecture", "components", 1, "config", "concurrency"], -5);
    expect(issuesFor(doc).map((i) => i.path)).toEqual([
      ["architecture", "components", 1, "config", "concurrency"],
    ]);
  });
});
