import { describe, expect, it } from "vitest";
import { lambdaDefinition } from "../../domain/components/aws";
import type { Edge } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";
import { awsNewEdge } from "../testing/aws-component-types";
import { sampleRecord } from "../testing/sample-record";
import {
  connectComponents,
  removeEdge,
  resetEdgeSetting,
  setEdgeSetting,
} from "./edge-edits";

/** A deep copy, to check later that a command left its input alone. */
function copyOf(record: ProjectRecord): ProjectRecord {
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

/** The edge with `id`, in `record`. */
function edgeIn(record: ProjectRecord, id: string): Edge {
  const edge = record.project.architecture.edges.find((e) => e.id === id);
  if (edge === undefined) throw new Error(`no edge "${id}"`);
  return edge;
}

/** `from` connected to `to` with `NewEdge`'s id and defaults, as the screen does it. */
function connect(record: ProjectRecord, from: string, to: string): Edge {
  const input = awsNewEdge().execute({ project: record.project, from, to });
  if (input === undefined) throw new Error(`can't connect "${from}"`);
  return edgeIn(connectComponents(record, input), input.edgeId);
}

const ONE_ATTEMPT = { maxAttempts: 1, backoff: "none", baseDelayMs: 0 };

describe("edge edit commands", () => {
  // Fails if NewEdge takes the defaults from the callee's type rather than
  // the caller's, if API Gateway's or Lambda's edgeDefaults change, or if
  // connectComponents changes the record it's given.
  it("connects with the caller type's defaults, and leaves the input unchanged", () => {
    const before = copyOf(sampleRecord);

    expect(connect(sampleRecord, "api", "table")).toEqual({
      id: "edge-1",
      from: "api",
      to: "table",
      latencyMs: 1,
      timeoutMs: 29_000,
      retry: ONE_ATTEMPT,
    });
    expect(connect(sampleRecord, "fn", "api")).toMatchObject({
      latencyMs: 1,
      timeoutMs: 5_000,
      retry: ONE_ATTEMPT,
    });
    expect(sampleRecord).toEqual(before);
  });

  // Fails if NewEdge offers a connection from a component the project
  // doesn't have, whose type it can't know.
  it("can't connect from a component the project doesn't have", () => {
    const project = sampleRecord.project;
    expect(
      awsNewEdge().execute({ project, from: "ghost", to: "fn" }),
    ).toBeUndefined();
  });

  // Fails if setEdgeSetting drops the edge's other settings, touches
  // another edge, or changes its input.
  it("sets one setting of one edge", () => {
    const before = copyOf(sampleRecord);

    const next = setEdgeSetting(sampleRecord, {
      edgeId: "fn-table",
      key: "timeoutMs",
      value: 3_000,
    });

    expect(edgeIn(next, "fn-table")).toEqual({
      ...edgeIn(sampleRecord, "fn-table"),
      timeoutMs: 3_000,
    });
    expect(edgeIn(next, "api-fn")).toBe(edgeIn(sampleRecord, "api-fn"));
    expect(sampleRecord).toEqual(before);
  });

  // Fails if resetEdgeSetting resets more than its own setting, or to
  // anything but the defaults it's given.
  it("resets a setting to its caller type's default", () => {
    const next = resetEdgeSetting(sampleRecord, {
      edgeId: "fn-table",
      key: "retry",
      defaults: lambdaDefinition.edgeDefaults,
    });

    expect(edgeIn(next, "fn-table")).toEqual({
      ...edgeIn(sampleRecord, "fn-table"),
      retry: ONE_ATTEMPT,
    });
  });

  // Fails if removeEdge takes a step that calls along the edge, or another
  // edge, with it: steps stay, and become run issues (ADR-0019).
  it("removes the edge, and leaves every step as it was", () => {
    const next = removeEdge(sampleRecord, { edgeId: "fn-table" });

    expect(next.project.architecture.edges.map((e) => e.id)).toEqual([
      "api-fn",
    ]);
    expect(next.project.workflows).toBe(sampleRecord.project.workflows);
    expect(next.project.architecture.components).toBe(
      sampleRecord.project.architecture.components,
    );
  });

  // Fails if a command for an edge the project doesn't have makes a new
  // record, which would save and make the run on screen out of date.
  it("returns the record itself when there's no such edge", () => {
    expect(removeEdge(sampleRecord, { edgeId: "ghost" })).toBe(sampleRecord);
    expect(
      setEdgeSetting(sampleRecord, {
        edgeId: "ghost",
        key: "latencyMs",
        value: 5,
      }),
    ).toBe(sampleRecord);
  });
});
