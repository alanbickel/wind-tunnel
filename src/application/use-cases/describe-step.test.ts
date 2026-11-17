import { describe, expect, it } from "vitest";
import type { Edge, Project } from "../../domain/model/project";
import type { StepDetails } from "../details/details";
import { awsDescribeSelection } from "../testing/aws-describe-selection";
import { sampleRecord } from "../testing/sample-record";

// A selected step, as DescribeSelection describes it on its own: its line
// of the outline, and how a request reaches it (UX design §5). Its
// workflow's details are describe-selection.test.ts's, and its "Used by"
// describe-workflow-use.test.ts's.

const describeSelection = awsDescribeSelection();
const sample = sampleRecord.project;

function stepIn(
  project: Project,
  workflowId: string,
  stepId: string,
): StepDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "step", workflowId, stepId },
  });
  if (details?.kind !== "step") throw new Error(`No ${stepId}`);
  return details;
}

/** What a step's details say of how a request reaches it. */
function arrivalOf({ arrival, edgeId }: StepDetails) {
  return { arrival, edgeId };
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

describe("DescribeSelection of a step", () => {
  // Fails if a selected step is described as its workflow, or as another
  // of its steps, or loses its line of the outline (its label, number,
  // issues, and what its Remove needs).
  it("describes a selected step as its own line of the outline", () => {
    const step = stepIn(sample, "read", "fn-invoke");
    const workflow = describeSelection.execute({
      project: sample,
      selection: { kind: "workflow", workflowId: "read" },
    });
    const line =
      workflow?.kind === "workflow" ? workflow.outline.calls[0] : undefined;

    expect(step.workflowId).toBe("read");
    expect(step.workflowName).toBe("Read item");
    expect(step.step).toEqual(line);
    expect(step.step.label).toBe("Function · invoke");
  });

  // Fails if a call doesn't name its caller and the edge it arrives on, or
  // the first step claims an edge or a caller, which the user is.
  it("says how a request reaches a call, along which edge, and the first step", () => {
    expect(arrivalOf(stepIn(sample, "read", "table-read"))).toEqual({
      arrival: "Called by Function · invoke, along Function → Table.",
      edgeId: "fn-table",
    });
    expect(arrivalOf(stepIn(sample, "read", "api-invoke"))).toEqual({
      arrival: "The first step: each request of Read item starts here.",
      edgeId: undefined,
    });
    expect(stepIn(sample, "read", "api-invoke").step.editing).toBeUndefined();
  });

  // Fails if an async root reads as a call, rather than its queue's
  // delivery, or loses the edge from the queue to its consumer.
  it("says an async root is delivered by its queue", () => {
    expect(arrivalOf(stepIn(queued, "write", "fn-invoke"))).toEqual({
      arrival: "Delivered by Queue · enqueue, along Queue → Function.",
      edgeId: "queue-fn",
    });
  });

  // Fails if a call with no edge to arrive on names one, or a step whose
  // component is gone is named by its id, which is never shown.
  it("says when a call has no edge, or its component is gone", () => {
    const { components, edges } = sample.architecture;
    const noEdge: Project = {
      ...sample,
      architecture: {
        components,
        edges: edges.filter((e) => e.id !== "fn-table"),
      },
    };
    const gone: Project = {
      ...noEdge,
      architecture: {
        components: components.filter((c) => c.id !== "table"),
        edges: noEdge.architecture.edges,
      },
    };

    expect(arrivalOf(stepIn(noEdge, "read", "table-read"))).toEqual({
      arrival:
        "Called by Function · invoke, but Function has no edge to Table.",
      edgeId: undefined,
    });
    expect(stepIn(gone, "read", "table-read").arrival).toBe(
      "Called by Function · invoke, but Function has no edge to a removed component.",
    );
  });
});
