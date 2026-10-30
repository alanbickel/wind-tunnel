import type { TypeFields } from "../field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "./edge-fields";

export const rdsFields: TypeFields = {
  type: "rds",
  purpose:
    "a relational database; refuses connections over its limit, and queues queries for its workers.",
  fields: [
    {
      key: "maxConnections",
      label: "Max connections",
      unit: "connections",
      kind: "whole-number",
      range: { min: 1, minExclusive: false, max: undefined },
      help: "Connections the database accepts before refusing more: its max_connections parameter. In AWS, the default depends on the engine and the instance's memory (RDS-1).",
      evidence: { level: "assumption", fidelityId: "RDS-1" },
    },
    {
      key: "queryWorkers",
      label: "Query workers",
      unit: "queries",
      kind: "whole-number",
      range: { min: 1, minExclusive: false, max: undefined },
      help: "How many queries the database runs at once, standing in for its CPU. Other queries wait for a worker, holding their connection. RDS has no such setting: a larger instance class has more CPU (RDS-2).",
      evidence: { level: "assumption", fidelityId: "RDS-2" },
    },
    {
      key: "queryTime",
      label: "Query time",
      unit: "ms",
      kind: "distribution",
      help: "How long one query runs once it has a worker, not counting its wait. It doesn't grow with load, as a real database's often does (ENG-6).",
      evidence: { level: "assumption", fidelityId: undefined },
    },
  ],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
};
