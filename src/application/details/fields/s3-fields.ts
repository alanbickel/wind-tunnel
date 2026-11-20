import type { TypeFields } from "../field-descriptor";
import { ASSUMED_EDGE_EVIDENCE } from "./edge-fields";

export const s3Fields: TypeFields = {
  type: "s3",
  purpose: "object storage, one key prefix; slows down requests over its rate.",
  fields: [
    {
      key: "readsPerSec",
      label: "Read rate",
      unit: "requests/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "GET and HEAD requests a second the prefix serves before S3 answers 503 Slow Down. In AWS, at least 5,500 per partitioned prefix; S3 raises a busy prefix's rate on its own, gradually, which isn't modeled (S3-1, S3-2).",
      evidence: { level: "documented", fidelityId: "S3-2" },
    },
    {
      key: "writesPerSec",
      label: "Write rate",
      unit: "requests/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "PUT, COPY, POST, and DELETE requests a second the prefix serves before S3 answers 503 Slow Down. In AWS, at least 3,500 per partitioned prefix, raised the same way (S3-1, S3-2).",
      evidence: { level: "documented", fidelityId: "S3-2" },
    },
    {
      key: "readLatency",
      label: "Read latency",
      unit: "ms",
      kind: "distribution",
      help: "How long S3 takes to answer a read its rate allows. AWS gives tens of milliseconds at the median for small objects; larger ones take longer (S3-5).",
      evidence: { level: "assumption", fidelityId: "S3-5" },
    },
    {
      key: "writeLatency",
      label: "Write latency",
      unit: "ms",
      kind: "distribution",
      help: "How long S3 takes to answer a write its rate allows. AWS gives tens of milliseconds at the median for small objects; larger ones take longer (S3-5).",
      evidence: { level: "assumption", fidelityId: "S3-5" },
    },
  ],
  edgeEvidence: ASSUMED_EDGE_EVIDENCE,
};
