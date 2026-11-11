import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { ComponentStatus } from "../../application/run-analysis/component-status";
import { sampleRecord } from "../../application/testing/sample-record";
import { diagramOf, type DiagramOfOptions } from "./diagram-of";

function withLayout(nodes: ProjectRecord["layout"]["nodes"]): ProjectRecord {
  return { ...sampleRecord, layout: { nodes } };
}

const NAMES: Readonly<Record<string, string>> = {
  "api-gateway": "API Gateway",
  lambda: "Lambda",
  dynamodb: "DynamoDB",
};
const options: DiagramOfOptions = {
  displayNameOf: (type) => NAMES[type] ?? type,
};

describe("diagramOf", () => {
  it("makes a node per component, named, typed in words with its icon, where the layout puts it", () => {
    expect(diagramOf(sampleRecord, options).nodes).toEqual([
      {
        id: "api",
        label: "API",
        caption: "API Gateway",
        icon: "api-gateway",
        position: { x: 0, y: 0 },
      },
      {
        id: "fn",
        label: "Function",
        caption: "Lambda",
        icon: "lambda",
        position: { x: 250, y: 0 },
      },
      {
        id: "table",
        label: "Table",
        caption: "DynamoDB",
        icon: "dynamodb",
        position: { x: 500, y: 0 },
      },
    ]);
  });

  it("makes an arrow per edge, from its caller to its callee", () => {
    expect(diagramOf(sampleRecord, options).edges).toEqual([
      { id: "api-fn", source: "api", target: "fn" },
      { id: "fn-table", source: "fn", target: "table" },
    ]);
  });

  it("puts a component the layout misses in a row below the placed ones", () => {
    const record = withLayout({ api: { x: 0, y: 0 }, fn: { x: 250, y: 100 } });

    const table = diagramOf(record, options).nodes.find(
      (node) => node.id === "table",
    );

    // The only unplaced one, so the first column; 150 px below the lowest (y = 100).
    expect(table?.position).toEqual({ x: 0, y: 250 });
  });

  it("numbers the spare row's columns among the unplaced components only", () => {
    const record = withLayout({ fn: { x: 250, y: 0 } });

    const positions = diagramOf(record, options).nodes.map((n) => [
      n.id,
      n.position,
    ]);

    expect(positions).toEqual([
      ["api", { x: 0, y: 150 }],
      ["fn", { x: 250, y: 0 }],
      ["table", { x: 250, y: 150 }],
    ]);
  });

  it("starts the spare row at the top when nothing is placed", () => {
    const positions = diagramOf(withLayout({}), options).nodes.map(
      (n) => n.position,
    );

    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 250, y: 0 },
      { x: 500, y: 0 },
    ]);
  });

  // Fails if a status is attached to the wrong component, if the word isn't
  // the shared one, or if a component the run never saw (added since) gets a
  // badge.
  it("gives each component its status, and none to one the run didn't see", () => {
    const badges = {
      statuses: new Map<string, ComponentStatus>([
        ["api", "ok"],
        ["fn", "refused"],
      ]),
      outOfDate: false,
    };

    const statuses = diagramOf(sampleRecord, { ...options, badges }).nodes.map(
      (node) => [node.id, node.status],
    );

    expect(statuses).toEqual([
      ["api", { kind: "ok", word: "ok", outOfDate: false }],
      ["fn", { kind: "refused", word: "refused", outOfDate: false }],
      ["table", undefined],
    ]);
  });

  // Fails if the out-of-date flag doesn't reach each badge.
  it("marks every badge out of date when the run is", () => {
    const badges = {
      statuses: new Map<string, ComponentStatus>([["api", "waited"]]),
      outOfDate: true,
    };

    const api = diagramOf(sampleRecord, { ...options, badges }).nodes[0];

    expect(api?.status).toEqual({
      kind: "waited",
      word: "waited",
      outOfDate: true,
    });
  });

  // Fails if a diagram with no run draws badges.
  it("gives no component a status with no run", () => {
    const statuses = diagramOf(sampleRecord, options).nodes.map(
      (n) => n.status,
    );

    expect(statuses).toEqual([undefined, undefined, undefined]);
  });
});
