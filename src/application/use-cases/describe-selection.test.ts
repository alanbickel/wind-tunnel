import { describe, expect, it } from "vitest";
import type { Edge, Project } from "../../domain/model/project";
import type { ComponentDetails, EdgeDetails } from "../details/details";
import { awsDescribeSelection } from "../testing/aws-describe-selection";
import { sampleRecord } from "../testing/sample-record";

const describeSelection = awsDescribeSelection();
const sample = sampleRecord.project;

function componentIn(project: Project, componentId: string): ComponentDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "component", componentId },
  });
  if (details?.kind !== "component") throw new Error(`No ${componentId}`);
  return details;
}

function edgeIn(project: Project, edgeId: string): EdgeDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "edge", edgeId },
  });
  if (details?.kind !== "edge") throw new Error(`No ${edgeId}`);
  return details;
}

/** The project with one component's config replaced. */
function withConfig(
  componentId: string,
  config: Readonly<Record<string, unknown>>,
): Project {
  const { components } = sample.architecture;
  return {
    ...sample,
    architecture: {
      ...sample.architecture,
      components: components.map((c) =>
        c.id === componentId ? { ...c, config } : c,
      ),
    },
  };
}

/** An edge's settings, for edges whose only point is what they join. */
const plainEdge: Omit<Edge, "id" | "from" | "to"> = {
  latencyMs: 1,
  timeoutMs: 1_000,
  retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
};

/** API → queue, whose async work calls the function: a queue's consumer. */
const queued: Project = {
  ...sample,
  architecture: {
    components: [
      ...sample.architecture.components,
      { id: "queue", type: "sqs", name: "Queue", config: {} },
    ],
    edges: [
      ...sample.architecture.edges,
      { ...plainEdge, id: "api-queue", from: "api", to: "queue" },
      { ...plainEdge, id: "queue-fn", from: "queue", to: "fn" },
      // To the queue, but from a component whose steps don't call it.
      { ...plainEdge, id: "fn-queue", from: "fn", to: "queue" },
    ],
  },
  workflows: [
    {
      id: "write",
      name: "Write later",
      root: {
        componentId: "api",
        action: "invoke",
        calls: [
          {
            componentId: "queue",
            action: "enqueue",
            async: { componentId: "fn", action: "invoke" },
          },
        ],
      },
    },
  ],
};

describe("DescribeSelection", () => {
  // Fails if a setting loses its label, its unit, its default, or the
  // default's evidence, or the type's display name isn't looked up.
  it("describes a component's settings with their units and defaults", () => {
    const table = componentIn(sample, "table");

    expect(table.name).toBe("Table");
    expect(table.typeName).toBe("DynamoDB");
    expect(
      table.settings.map((s) => [s.label, s.value, s.defaultNote]),
    ).toEqual([
      ["Read capacity", "1,000 read units/s", "Default 1,000: an assumption."],
      ["Write capacity", "500 write units/s", "Default 500: an assumption."],
      ["Burst", "300 s", "Default 300: documented (DDB-2)."],
      [
        "Latency",
        "lognormal, median 5 ms, p99 20 ms",
        "Default lognormal, median 5 ms, p99 20 ms: an assumption.",
      ],
    ]);
    expect(table.settings[2]?.help).toContain("(DDB-2)");
  });

  // Fails if the value shown is the type's default rather than the
  // component's own, or the default follows the component's value.
  it("shows the component's value beside the type's default", () => {
    const project = withConfig("fn", {
      ...sample.architecture.components[1]?.config,
      concurrency: 50,
    });

    const concurrency = componentIn(project, "fn").settings[0];

    expect(concurrency?.value).toBe("50 invocations");
    expect(concurrency?.defaultNote).toBe("Default 1,000: documented (LMB-1).");
  });

  // Fails if a setting no descriptor covers is dropped, hiding part of the
  // component's config.
  it("lists a setting that has no descriptor, by its key", () => {
    const project = withConfig("api", {
      ...sample.architecture.components[0]?.config,
      stageName: "prod",
    });

    const settings = componentIn(project, "api").settings;

    expect(settings.map((s) => s.label)).toEqual([
      "Rate",
      "Burst",
      "Overhead",
      "stageName",
    ]);
    expect(settings[3]?.value).toBe('"prod"');
  });

  // Fails if "Called by" lists a workflow that doesn't call the component,
  // or misses one that calls it only from a queue's async work.
  it("lists the workflows that call a component, async work included", () => {
    expect(componentIn(sample, "fn").calledBy).toEqual(["Read item"]);
    expect(componentIn(queued, "fn").calledBy).toEqual(["Write later"]);
    expect(componentIn(queued, "table").calledBy).toEqual([]);
  });

  // Fails if an edge's settings lose their units, the retry policy isn't
  // read as one value, an edge shows a default it doesn't have, or the
  // steps along it are missed.
  it("describes an edge's settings and the steps that call along it", () => {
    const edge = edgeIn(sample, "fn-table");

    expect([edge.sourceName, edge.targetName]).toEqual(["Function", "Table"]);
    expect(edge.settings.map((s) => [s.label, s.value, s.defaultNote])).toEqual(
      [
        ["Latency", "2 ms", undefined],
        ["Timeout", "1,000 ms", undefined],
        [
          "Retries",
          "3 attempts, backing off exponentially from 50 ms",
          undefined,
        ],
      ],
    );
    expect(edge.calledAlongBy).toEqual([
      { workflowName: "Read item", action: "read" },
    ]);
  });

  // Fails if a queue's async work isn't counted as calling along the edge
  // from the queue, or a step is counted on an edge it doesn't travel.
  it("counts a queue's async work as calling along the queue's edge", () => {
    expect(edgeIn(queued, "queue-fn").calledAlongBy).toEqual([
      { workflowName: "Write later", action: "invoke" },
    ]);
    expect(edgeIn(queued, "fn-queue").calledAlongBy).toEqual([]);
  });

  // Fails if stepsAlong stops dropping repeats: a workflow that reads the
  // table twice would be listed twice.
  it("lists each workflow and action along an edge once", () => {
    const fn = sample.workflows[0]?.root.calls?.[0];
    const twice: Project = {
      ...sample,
      workflows: [
        {
          id: "twice",
          name: "Read twice",
          root: {
            componentId: "fn",
            action: "invoke",
            calls: [...(fn?.calls ?? []), ...(fn?.calls ?? [])],
          },
        },
      ],
    };

    expect(edgeIn(twice, "fn-table").calledAlongBy).toEqual([
      { workflowName: "Read twice", action: "read" },
    ]);
  });

  // Fails if a selection of something the project doesn't have throws, or
  // describes something else.
  it("describes nothing for an item the project doesn't have", () => {
    for (const selection of [
      { kind: "component", componentId: "gone" },
      { kind: "edge", edgeId: "gone" },
    ] as const) {
      expect(describeSelection.execute({ project: sample, selection })).toBe(
        undefined,
      );
    }
  });
});
