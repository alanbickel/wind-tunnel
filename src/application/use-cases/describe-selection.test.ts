import { describe, expect, it } from "vitest";
import type { Edge, Project } from "../../domain/model/project";
import type {
  ComponentDetails,
  EdgeDetails,
  WorkflowDetails,
} from "../details/details";
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

function workflowIn(project: Project, workflowId: string): WorkflowDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "workflow", workflowId },
  });
  if (details?.kind !== "workflow") throw new Error(`No ${workflowId}`);
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

/** What a step that isn't an enqueue or an async root says about async work. */
const NOT_ASYNC = { asyncSlot: undefined, description: undefined };

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
        id: "api-invoke",
        componentId: "api",
        action: "invoke",
        calls: [
          {
            id: "queue-enqueue",
            componentId: "queue",
            action: "enqueue",
            async: { id: "fn-invoke", componentId: "fn", action: "invoke" },
          },
        ],
      },
    },
  ],
};

/** One workflow whose function reads the table twice. */
const readTwice: Project = {
  ...sample,
  workflows: [
    {
      id: "twice",
      name: "Read twice",
      root: {
        id: "fn-invoke-2",
        componentId: "fn",
        action: "invoke",
        calls: [
          { id: "table-read-1", componentId: "table", action: "read" },
          { id: "table-read-2", componentId: "table", action: "read" },
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

  // Fails if Remove's question misses one of the component's edges, names
  // an edge it isn't on, or names an edge's end the wrong way round.
  it("asks to remove a component and each of its own edges", () => {
    const unjoined = {
      ...sample,
      architecture: { ...sample.architecture, edges: [] },
    };

    expect(componentIn(unjoined, "table").removal.question).toBe(
      "Remove Table?",
    );
    expect(componentIn(queued, "table").removal.question).toBe(
      "Remove Table and its edge from Function?",
    );
    expect(componentIn(queued, "fn").removal.question).toBe(
      "Remove Function and its edges from API, to Table, from Queue, and to Queue?",
    );
  });

  // Fails if the warning miscounts the steps that call the component,
  // async work included, or warns when none does.
  it("warns how many steps call a component, which stay", () => {
    const both = {
      ...queued,
      workflows: [...sample.workflows, ...queued.workflows],
    };

    expect(componentIn(queued, "table").removal.warning).toBeUndefined();
    expect(componentIn(queued, "fn").removal.warning).toBe(
      "1 workflow step calls it, and won't run until you change it.",
    );
    expect(componentIn(both, "fn").removal.warning).toBe(
      "2 workflow steps call it, and won't run until you change them.",
    );
  });

  // Fails if an edge's settings lose their units, the retry policy isn't
  // read as one value, an edge's defaults aren't its caller type's (here
  // Lambda's), or the steps along it are missed.
  it("describes an edge's settings, its caller type's defaults, and the steps along it", () => {
    const edge = edgeIn(sample, "fn-table");

    expect([edge.sourceName, edge.targetName]).toEqual(["Function", "Table"]);
    expect(edge.settings.map((s) => [s.label, s.value, s.defaultNote])).toEqual(
      [
        ["Latency", "2 ms", "Default 1: an assumption (ENG-1)."],
        ["Timeout", "1,000 ms", "Default 5,000: an assumption (ENG-5)."],
        [
          "Retries",
          "3 attempts, backing off exponentially from 50 ms",
          "Default 1 attempt, no retries: an assumption (ENG-2).",
        ],
      ],
    );
    expect(edge.calledAlongBy).toEqual([
      { workflowName: "Read item", action: "read" },
    ]);
  });

  // Fails if an edge from API Gateway takes another type's timeout or
  // evidence, or its settings come without what a field needs to edit them.
  it("gives an edge from API Gateway its documented timeout, and an editor for each setting", () => {
    const edge = edgeIn(sample, "api-fn");

    expect(edge.defaults?.timeoutMs).toBe(29_000);
    const timeout = edge.settings.find((s) => s.key === "timeoutMs");
    expect(timeout?.defaultNote).toBe("Default 29,000: documented (ENG-5).");
    expect(timeout?.editor?.defaultValue).toBe(29_000);
    expect(edge.settings.map((s) => s.editor?.field.kind)).toEqual([
      "number",
      "number",
      "retry",
    ]);
  });

  // Fails if an edge's Remove names the wrong ends, or doesn't count every
  // step that calls along it: a queue's async work, and both of two steps
  // in one workflow with the same action.
  it("asks to remove an edge, and warns how many steps call along it", () => {
    expect(edgeIn(sample, "fn-table").removal).toEqual({
      question: "Remove the edge from Function to Table?",
      warning:
        "1 workflow step calls along it, and won't run until you change it.",
    });
    expect(edgeIn(queued, "queue-fn").removal.warning).toBe(
      "1 workflow step calls along it, and won't run until you change it.",
    );
    expect(edgeIn(queued, "fn-queue").removal.warning).toBeUndefined();
    expect(edgeIn(readTwice, "fn-table").removal.warning).toBe(
      "2 workflow steps call along it, and won't run until you change them.",
    );
  });

  // Fails if "Connect to…" offers the component itself, or one it already
  // has an edge to; or loses the type's display name.
  it("offers to connect a component to the others it doesn't reach yet", () => {
    expect(componentIn(sample, "fn").connectTargets).toEqual([
      { componentId: "api", label: "API (API Gateway)" },
    ]);
    expect(
      componentIn(sample, "table").connectTargets.map((t) => t.componentId),
    ).toEqual(["api", "fn"]);
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
    expect(edgeIn(readTwice, "fn-table").calledAlongBy).toEqual([
      { workflowName: "Read twice", action: "read" },
    ]);
  });

  // Fails if the outline loses a step, numbers one wrongly, names a step by
  // its id or its component's id rather than its component's name, drops
  // an enqueue's async work or numbers it before the calls, or puts the
  // queue's call to the table, which has no edge, on any step but its own;
  // or offers "Add a call" under an enqueue, whose follow-up work is its
  // async work (ADR-0021), or gives the async root a caller other than the
  // queue, a Move, or any words but "Runs when a consumer takes the message
  // from Queue."
  it("outlines a workflow's steps, numbered, async work after the calls", () => {
    const withCall: Project = {
      ...queued,
      workflows: queued.workflows.map((workflow) => ({
        ...workflow,
        root: {
          ...workflow.root,
          calls: [
            {
              id: "queue-enqueue",
              componentId: "queue",
              action: "enqueue",
              calls: [
                { id: "table-write", componentId: "table", action: "write" },
              ],
              async: { id: "fn-invoke", componentId: "fn", action: "invoke" },
            },
          ],
        },
      })),
    };

    const { outline } = workflowIn(withCall, "write");

    expect(outline).toEqual({
      stepId: "api-invoke",
      number: "1",
      label: "API · invoke",
      issues: [],
      async: undefined,
      ...NOT_ASYNC,
      editing: undefined,
      addCallLabel: "Add a call from API",
      calls: [
        {
          stepId: "queue-enqueue",
          number: "1.1",
          label: "Queue · enqueue",
          issues: [],
          addCallLabel: undefined,
          ...NOT_ASYNC,
          editing: {
            callerStepId: "api-invoke",
            moves: undefined,
            removal: {
              question: "Remove Queue · enqueue and the 2 calls under it?",
              warning: undefined,
            },
            emptiesSlotOf: undefined,
          },
          calls: [
            {
              stepId: "table-write",
              number: "1.1.1",
              label: "Table · write",
              issues: [
                "This step calls Table from Queue, which has no edge to it.",
              ],
              calls: [],
              async: undefined,
              ...NOT_ASYNC,
              addCallLabel: "Add a call from Table",
              editing: {
                callerStepId: "queue-enqueue",
                moves: undefined,
                removal: undefined,
                emptiesSlotOf: undefined,
              },
            },
          ],
          async: {
            stepId: "fn-invoke",
            number: "1.1.2",
            label: "Function · invoke",
            issues: [],
            calls: [],
            async: undefined,
            asyncSlot: undefined,
            description: "Runs when a consumer takes the message from Queue.",
            editing: {
              callerStepId: "queue-enqueue",
              moves: undefined,
              removal: undefined,
              emptiesSlotOf: "Queue · enqueue",
            },
            addCallLabel: "Add a call from Function",
          },
        },
      ],
    });
  });

  // Fails if "Used by" misses a workload whose mix has the workflow, lists
  // one whose mix doesn't, or loses the project's order.
  it("names the workloads that use a workflow, in project order", () => {
    const [steady] = sample.workloads;
    if (steady === undefined) throw new Error("sample has no workload");
    const project: Project = {
      ...sample,
      workloads: [
        { ...steady, id: "spike", name: "Spike" },
        { ...steady, id: "other", name: "Other", mix: [] },
        steady,
      ],
    };

    expect(workflowIn(project, "read").usedBy).toEqual(["Spike", "Steady"]);
    expect(workflowIn({ ...project, workloads: [] }, "read").usedBy).toEqual(
      [],
    );
  });

  // Fails if Remove's confirmation for a workflow doesn't name the workloads
  // whose mix has it (one or several, in project order), or says more than
  // the question when none does.
  it("words a workflow's removal by the workloads that run it", () => {
    const [steady] = sample.workloads;
    if (steady === undefined) throw new Error("sample has no workload");
    const spike = { ...steady, id: "spike", name: "Spike" };
    const two: Project = { ...sample, workloads: [steady, spike] };

    expect(workflowIn(two, "read").removal).toEqual({
      question: "Remove Read item?",
      warning: "Steady and Spike run it; it leaves their mixes.",
    });
    expect(workflowIn(sample, "read").removal.warning).toBe(
      "Steady runs it; it leaves its mix.",
    );
    expect(workflowIn({ ...sample, workloads: [] }, "read").removal).toEqual({
      question: "Remove Read item?",
      warning: undefined,
    });
  });

  // Fails if a selected step doesn't show its workflow's outline, or isn't
  // the one marked, or a workflow selected on its own marks a step.
  it("marks the selected step in its workflow's outline", () => {
    const step = describeSelection.execute({
      project: sample,
      selection: { kind: "step", workflowId: "read", stepId: "fn-invoke" },
    });

    expect(step?.kind === "workflow" && step.name).toBe("Read item");
    expect(step?.kind === "workflow" && step.currentStepId).toBe("fn-invoke");
    expect(workflowIn(sample, "read").currentStepId).toBeUndefined();
  });

  // Fails if a step whose component is gone is named by the component's
  // id, which is never shown.
  it("names a step whose component was removed without its id", () => {
    const project = {
      ...sample,
      architecture: { components: [], edges: [] },
    };

    expect(workflowIn(project, "read").outline.label).toBe(
      "a removed component · invoke",
    );
  });

  // Fails if a selection of something the project doesn't have throws, or
  // describes something else.
  it("describes nothing for an item the project doesn't have", () => {
    for (const selection of [
      { kind: "component", componentId: "gone" },
      { kind: "edge", edgeId: "gone" },
      { kind: "workflow", workflowId: "gone" },
      { kind: "step", workflowId: "gone", stepId: "fn-invoke" },
      { kind: "step", workflowId: "read", stepId: "gone" },
    ] as const) {
      expect(describeSelection.execute({ project: sample, selection })).toBe(
        undefined,
      );
    }
  });
});
