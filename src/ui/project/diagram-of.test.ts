import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../application/ports/project-record";
import { sampleRecord } from "../../application/testing/sample-record";
import { diagramOf } from "./diagram-of";

function withLayout(nodes: ProjectRecord["layout"]["nodes"]): ProjectRecord {
  return { ...sampleRecord, layout: { nodes } };
}

describe("diagramOf", () => {
  it("makes a node per component, named and typed, where the layout puts it", () => {
    expect(diagramOf(sampleRecord).nodes).toEqual([
      {
        id: "api",
        label: "API",
        caption: "api-gateway",
        position: { x: 0, y: 0 },
      },
      {
        id: "fn",
        label: "Function",
        caption: "lambda",
        position: { x: 250, y: 0 },
      },
      {
        id: "table",
        label: "Table",
        caption: "dynamodb",
        position: { x: 500, y: 0 },
      },
    ]);
  });

  it("makes an arrow per edge, from its caller to its callee", () => {
    expect(diagramOf(sampleRecord).edges).toEqual([
      { id: "api-fn", source: "api", target: "fn" },
      { id: "fn-table", source: "fn", target: "table" },
    ]);
  });

  it("puts a component the layout misses in a row below the placed ones", () => {
    const record = withLayout({ api: { x: 0, y: 0 }, fn: { x: 250, y: 100 } });

    const table = diagramOf(record).nodes.find((node) => node.id === "table");

    // The only unplaced one, so the first column; 150 px below the lowest (y = 100).
    expect(table?.position).toEqual({ x: 0, y: 250 });
  });

  it("numbers the spare row's columns among the unplaced components only", () => {
    const record = withLayout({ fn: { x: 250, y: 0 } });

    const positions = diagramOf(record).nodes.map((n) => [n.id, n.position]);

    expect(positions).toEqual([
      ["api", { x: 0, y: 150 }],
      ["fn", { x: 250, y: 0 }],
      ["table", { x: 250, y: 150 }],
    ]);
  });

  it("starts the spare row at the top when nothing is placed", () => {
    const positions = diagramOf(withLayout({})).nodes.map((n) => n.position);

    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 250, y: 0 },
      { x: 500, y: 0 },
    ]);
  });
});
