import { describe, expect, it } from "vitest";
import type { StepIssue, WorkloadIssue } from "../../domain/model/run-issue";
import {
  stepIssueText,
  workloadIssueText,
  type RunIssueNames,
} from "./run-issue-phrases";

const names: RunIssueNames = {
  component: (id) => `<${id}>`,
  workflow: (id) => `[${id}]`,
};

const STEP_ISSUES: readonly (readonly [StepIssue, string])[] = [
  [
    { kind: "unknown-component", path: [], componentId: "db" },
    "[a] calls a component that isn't in the architecture any more.",
  ],
  [
    { kind: "missing-edge", path: [], fromId: "api", toId: "db" },
    "[a] calls <db> from <api>, which has no edge to it.",
  ],
  [
    {
      kind: "action-not-accepted",
      path: [],
      componentId: "q",
      action: "read",
      accepted: ["enqueue"],
    },
    '[a] asks <q> to "read", but it accepts only "enqueue".',
  ],
  [
    { kind: "async-not-on-enqueue", path: [], action: "invoke" },
    '[a] gives async work to a "invoke" step; only "enqueue" steps can have it.',
  ],
  [
    { kind: "async-not-delivered", path: [], componentId: "fn" },
    "[a] gives <fn> async work to deliver, but only queue-like components can deliver it.",
  ],
];

const WORKLOAD_ISSUES: readonly (readonly [WorkloadIssue, string])[] = [
  [{ kind: "empty-mix", path: [] }, "The mix has no workflows."],
  [
    { kind: "unknown-workflow", path: [], workflowId: "gett" },
    'The mix names a workflow that isn\'t in the project: "gett".',
  ],
  [
    { kind: "repeated-workflow", path: [], workflowId: "get" },
    "The mix names [get] more than once.",
  ],
  [
    { kind: "weight-not-positive", path: [], workflowId: "get", weight: 0 },
    "The mix gives [get] a weight of 0; weights must be positive.",
  ],
  [{ kind: "empty-profile", path: [] }, "The profile has no points."],
  [
    {
      kind: "profile-time-not-increasing",
      path: [],
      atMs: 5_000,
      previousAtMs: 10_000,
    },
    "The profile's times must increase; 5 s comes after 10 s.",
  ],
  [
    { kind: "negative-rate", path: [], atMs: 0, requestsPerSec: -5 },
    "The profile's rate at 0 s is -5 requests per second; rates can't be negative.",
  ],
];

describe("run issue phrases", () => {
  // Fails if a step issue's phrase changes, or names a component by ID.
  it.each(STEP_ISSUES)("words %o", (issue, text) => {
    expect(stepIssueText({ issue, workflowIds: ["a"] }, names)).toBe(text);
  });

  // Fails if a workload issue's phrase changes.
  it.each(WORKLOAD_ISSUES)("words %o", (issue, text) => {
    expect(workloadIssueText(issue, names)).toBe(text);
  });

  // Fails if the verb doesn't agree with several workflows, or the list
  // loses its "and".
  it("names several workflows as one subject", () => {
    const issue: StepIssue = {
      kind: "unknown-component",
      path: [],
      componentId: "db",
    };
    expect(stepIssueText({ issue, workflowIds: ["a", "b"] }, names)).toBe(
      "[a] and [b] call a component that isn't in the architecture any more.",
    );
    expect(stepIssueText({ issue, workflowIds: ["a", "b", "c"] }, names)).toBe(
      "[a], [b], and [c] call a component that isn't in the architecture any more.",
    );
  });
});
