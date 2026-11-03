import type { TypeFields } from "../field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "./edge-fields";

export const dynamoDbFields: TypeFields = {
  type: "dynamodb",
  purpose: "a key-value table; throttles reads and writes over its capacity.",
  fields: [
    {
      key: "readUnitsPerSec",
      label: "Read capacity",
      unit: "read units/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "The table's provisioned read capacity; each read uses one unit. In AWS, one unit is one strongly consistent read a second, or two eventually consistent ones, for an item up to 4 KB (DDB-1).",
      evidence: { level: "assumption", fidelityId: undefined },
    },
    {
      key: "writeUnitsPerSec",
      label: "Write capacity",
      unit: "write units/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "The table's provisioned write capacity; each write uses one unit. In AWS, one unit is one write a second for an item up to 1 KB (DDB-1).",
      evidence: { level: "assumption", fidelityId: undefined },
    },
    {
      key: "burstSec",
      label: "Burst",
      unit: "s",
      kind: "number",
      range: { min: 0, minExclusive: false, max: undefined },
      help: "Seconds of unused capacity the table saves up and can spend in a burst. In AWS, DynamoDB keeps up to 300 seconds' worth, but doesn't promise it (DDB-2).",
      evidence: { level: "documented", fidelityId: "DDB-2" },
    },
    {
      key: "latency",
      label: "Latency",
      unit: "ms",
      kind: "distribution",
      help: "How long DynamoDB takes to answer a request that its capacity allows.",
      evidence: { level: "assumption", fidelityId: undefined },
    },
  ],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
};
