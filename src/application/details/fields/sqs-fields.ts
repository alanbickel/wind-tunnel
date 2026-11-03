import type { TypeFields } from "../field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "./edge-fields";

export const sqsFields: TypeFields = {
  type: "sqs",
  purpose:
    "a queue; holds messages until a consumer takes them, so work can wait.",
  fields: [
    {
      key: "consumerMaxConcurrency",
      label: "Consumer concurrency",
      unit: "messages",
      kind: "whole-number",
      range: { min: 2, minExclusive: false, max: 1_000 },
      help: "How many messages the Lambda consumer works on at once. In AWS, the event source mapping's maximum concurrency. The model reaches it at once, where Lambda adds consumers over minutes (SQS-3).",
      evidence: { level: "assumption", fidelityId: undefined },
    },
    {
      key: "sendLatency",
      label: "Send time",
      unit: "ms",
      kind: "distribution",
      help: "How long SendMessage takes to return to the sender.",
      evidence: { level: "assumption", fidelityId: undefined },
    },
  ],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
};
