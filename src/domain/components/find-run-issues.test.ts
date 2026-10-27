import { describe, expect, it } from "vitest";
import type { Project, Step, Workload } from "../model/project";
import { ComponentRegistryMap } from "./component-registry-map";
import { findRunIssues } from "./find-run-issues";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";
import { loadWorkload, queuedProject } from "./testing/queued-project";

const registry = new ComponentRegistryMap()
  .register(workerPoolDefinition)
  .register(messageQueueDefinition);

/** The project with `root` as its only workflow, "w", which "load" runs. */
const withRoot = (root: Step): Project => ({
  ...queuedProject(),
  workflows: [{ id: "w", name: "W", root }],
  workloads: [loadWorkload({ mix: [{ workflowId: "w", weight: 1 }] })],
});

/** The issues of the workflow "w". */
const stepIssues = (root: Step) =>
  findRunIssues(withRoot(root), registry).workflows.get("w");

/** The issues of the workload "load", changed by `overrides`. */
const workloadIssues = (overrides: Partial<Workload>) =>
  findRunIssues(
    { ...queuedProject(), workloads: [loadWorkload(overrides)] },
    registry,
  ).workloads.get("load");

const invoke = (componentId: string, calls: Step[] = []): Step => ({
  componentId,
  action: "invoke",
  calls,
});

describe("findRunIssues", () => {
  // Fails if a sound workflow or workload is reported, or left out.
  it("gives each workflow and workload an empty list when all is sound", () => {
    const issues = findRunIssues(queuedProject(), registry);
    expect([...issues.workflows]).toEqual([
      ["create", []],
      ["get", []],
    ]);
    expect([...issues.workloads]).toEqual([["load", []]]);
  });

  // Fails if issues are filed under the wrong workflow.
  it("keeps each workflow's issues under its own ID", () => {
    const p = queuedProject();
    const project = {
      ...p,
      workflows: [
        ...p.workflows,
        { id: "bad", name: "Bad", root: invoke("x") },
      ],
    };
    const { workflows } = findRunIssues(project, registry);
    expect(workflows.get("create")).toEqual([]);
    expect(workflows.get("bad")).toHaveLength(1);
  });

  describe("steps", () => {
    // Fails if checkTarget stops reporting a step's missing component.
    it("reports a step on a component that isn't in the architecture", () => {
      expect(stepIssues(invoke("front", [invoke("ghost")]))).toEqual([
        {
          kind: "unknown-component",
          path: ["workflows", 0, "root", "calls", 0, "componentId"],
          componentId: "ghost",
        },
      ]);
    });

    // Fails if checkEdge reports a call from a component that isn't in the architecture.
    it("reports a missing component's calls only as its own issue", () => {
      expect(stepIssues(invoke("ghost", [invoke("front")]))).toEqual([
        {
          kind: "unknown-component",
          path: ["workflows", 0, "root", "componentId"],
          componentId: "ghost",
        },
      ]);
    });

    // Fails if checkEdge is skipped, or looks the edge up the wrong way round.
    it("reports a call that doesn't follow an edge, in its direction", () => {
      expect(stepIssues(invoke("consumer", [invoke("q")]))).toMatchObject([
        {
          kind: "missing-edge",
          path: ["workflows", 0, "root", "calls", 0],
          fromId: "consumer",
          toId: "q",
        },
        { kind: "action-not-accepted" },
      ]);
      expect(stepIssues(invoke("q", [invoke("front")]))).toMatchObject([
        { kind: "action-not-accepted" },
        { kind: "missing-edge", fromId: "q", toId: "front" },
      ]);
    });

    // Fails if the queue's delivery to its consumer isn't checked as a call.
    it("requires async work to follow an edge from the queue", () => {
      const root = invoke("front", [
        { componentId: "q", action: "enqueue", async: invoke("front") },
      ]);
      expect(stepIssues(root)).toEqual([
        {
          kind: "missing-edge",
          path: ["workflows", 0, "root", "calls", 0, "async"],
          fromId: "q",
          toId: "front",
        },
      ]);
    });

    // Fails if checkAsync stops checking the step's action.
    it("allows async work only on enqueue steps", () => {
      const root: Step = {
        componentId: "q",
        action: "invoke",
        async: invoke("consumer"),
      };
      expect(stepIssues(root)).toContainEqual({
        kind: "async-not-on-enqueue",
        path: ["workflows", 0, "root", "async"],
        action: "invoke",
      });
    });

    // Fails if checkType is skipped for nested or async steps.
    it("reports actions the component doesn't accept, including in async steps", () => {
      const root: Step = {
        componentId: "front",
        action: "write",
        calls: [
          {
            componentId: "q",
            action: "enqueue",
            async: { componentId: "consumer", action: "enqueue" },
          },
        ],
      };
      expect(stepIssues(root)).toEqual([
        {
          kind: "action-not-accepted",
          path: ["workflows", 0, "root", "action"],
          componentId: "front",
          action: "write",
          accepted: ["invoke", "read"],
        },
        {
          kind: "action-not-accepted",
          path: ["workflows", 0, "root", "calls", 0, "async", "action"],
          componentId: "consumer",
          action: "enqueue",
          accepted: ["invoke", "read"],
        },
      ]);
    });

    // Fails if checkType stops checking deliversAsync.
    it("reports async work on a component that isn't queue-like", () => {
      const root: Step = {
        componentId: "front",
        action: "invoke",
        async: { componentId: "q", action: "enqueue" },
      };
      expect(stepIssues(root)).toContainEqual({
        kind: "async-not-delivered",
        path: ["workflows", 0, "root", "async"],
        componentId: "front",
      });
    });
  });

  describe("workloads", () => {
    // Fails if mixIssues stops checking for an empty mix.
    it("reports an empty mix", () => {
      expect(workloadIssues({ mix: [] })).toEqual([
        { kind: "empty-mix", path: ["workloads", 0, "mix"] },
      ]);
    });

    // Fails if mixIssues stops checking a mix entry's workflow.
    it("reports unknown and repeated workflows in the mix", () => {
      const mix = [
        { workflowId: "get", weight: 1 },
        { workflowId: "get", weight: 1 },
        { workflowId: "ghost", weight: 1 },
      ];
      expect(workloadIssues({ mix })).toEqual([
        {
          kind: "repeated-workflow",
          path: ["workloads", 0, "mix", 1, "workflowId"],
          workflowId: "get",
        },
        {
          kind: "unknown-workflow",
          path: ["workloads", 0, "mix", 2, "workflowId"],
          workflowId: "ghost",
        },
      ]);
    });

    // Fails if a zero weight passes.
    it("reports weights that aren't positive", () => {
      const mix = [
        { workflowId: "get", weight: 0 },
        { workflowId: "create", weight: -1 },
      ];
      expect(workloadIssues({ mix })).toMatchObject([
        { kind: "weight-not-positive", workflowId: "get", weight: 0 },
        { kind: "weight-not-positive", workflowId: "create", weight: -1 },
      ]);
    });

    // Fails if profileIssues stops checking for an empty profile.
    it("reports an empty profile", () => {
      expect(workloadIssues({ profile: [] })).toEqual([
        { kind: "empty-profile", path: ["workloads", 0, "profile"] },
      ]);
    });

    // Fails if two points at the same time pass.
    it("reports profile times that don't increase", () => {
      const profile = [
        { atMs: 0, requestsPerSec: 1 },
        { atMs: 10_000, requestsPerSec: 1 },
        { atMs: 10_000, requestsPerSec: 1 },
        { atMs: 5_000, requestsPerSec: 1 },
      ];
      expect(workloadIssues({ profile })).toEqual([
        {
          kind: "profile-time-not-increasing",
          path: ["workloads", 0, "profile", 2, "atMs"],
          atMs: 10_000,
          previousAtMs: 10_000,
        },
        {
          kind: "profile-time-not-increasing",
          path: ["workloads", 0, "profile", 3, "atMs"],
          atMs: 5_000,
          previousAtMs: 10_000,
        },
      ]);
    });

    // Fails if profileIssues stops checking rates.
    it("reports negative rates", () => {
      const profile = [{ atMs: 0, requestsPerSec: -5 }];
      expect(workloadIssues({ profile })).toEqual([
        {
          kind: "negative-rate",
          path: ["workloads", 0, "profile", 0, "requestsPerSec"],
          atMs: 0,
          requestsPerSec: -5,
        },
      ]);
    });
  });
});
