import type {
  ConfigFieldDescriptor,
  DefaultEvidence,
  TypeFields,
} from "../field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "./edge-fields";

/** A default we chose, with no entry behind it. */
const ASSUMED: DefaultEvidence = { level: "assumption", fidelityId: undefined };

/** An item's size, read or written; `stored` says which, e.g. "a read returns". */
function itemSize(stored: string, perUnit: string): ConfigFieldDescriptor {
  return {
    key: "itemSizeKb",
    label: "Item size",
    unit: "KB",
    kind: "whole-number",
    range: { min: 1, minExclusive: false, max: 400 },
    help: `The size of the item ${stored}, rounded up to a whole KB; DynamoDB's largest item is 400 KB. ${perUnit}`,
    evidence: ASSUMED,
  };
}

export const dynamoDbFields: TypeFields = {
  type: "dynamodb",
  purpose: "a key-value table; throttles reads and writes over its capacity.",
  category: "data",
  fields: [
    {
      key: "readUnitsPerSec",
      label: "Read capacity",
      unit: "read units/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "The table's provisioned read capacity, in units a second. A read uses one unit per started 4 KB of its item if strongly consistent, and half that if eventually consistent, as in AWS; each read step sets its item's size and consistency. A 1 KB eventually consistent read uses half a unit, so the table serves twice as many of them. The units taken count units, not reads.",
      evidence: { level: "assumption", fidelityId: undefined },
    },
    {
      key: "writeUnitsPerSec",
      label: "Write capacity",
      unit: "write units/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "The table's provisioned write capacity, in units a second. A write uses one unit per started 1 KB of its item, as in AWS; each write step sets its item's size. The units taken count units, not writes.",
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
  requestFields: {
    read: [
      itemSize(
        "a read returns",
        "A read uses one read unit per started 4 KB, strongly consistent, or half that eventually consistent.",
      ),
      {
        key: "consistency",
        label: "Read consistency",
        unit: undefined,
        kind: "choice",
        options: [
          { value: "eventual", label: "Eventually consistent" },
          { value: "strong", label: "Strongly consistent" },
        ],
        help: "Whether the read may miss a recent write. A strongly consistent read uses twice the units of an eventually consistent one, which is DynamoDB's default.",
        evidence: { level: "documented", fidelityId: undefined },
      },
    ],
    write: [
      itemSize(
        "a write stores",
        "A write uses one write unit per started 1 KB.",
      ),
    ],
  },
};
