import type { TypeFields } from "../field-descriptor";

export const lambdaFields: TypeFields = {
  type: "lambda",
  fields: [
    {
      key: "concurrency",
      label: "Concurrency",
      unit: "invocations",
      kind: "whole-number",
      range: { min: 0, minExclusive: false, max: undefined },
      help: "Invocations running at once before Lambda throttles; 0 turns the function off. In AWS, the function's reserved concurrency, if it has one; otherwise the account's unreserved pool, shared by every function (LMB-1).",
      evidence: { level: "documented", fidelityId: "LMB-1" },
    },
    {
      key: "coldStart",
      label: "Cold start",
      unit: "ms",
      kind: "distribution",
      help: "Extra time an invocation spends starting an execution environment when no warm one is free. It counts against concurrency. In AWS it runs from under 100 ms to over 1 s, by runtime, package size, and initialization code (LMB-6).",
      evidence: { level: "assumption", fidelityId: "LMB-6" },
    },
    {
      key: "idleTimeoutSec",
      label: "Idle timeout",
      unit: "s",
      kind: "number",
      range: { min: 0, minExclusive: false, max: undefined },
      help: "How long an idle execution environment stays warm; the next invocation after that pays a cold start. AWS has no such setting and doesn't publish the time; measurements put it at 5 to 15 minutes (LMB-5).",
      evidence: { level: "observed", fidelityId: "LMB-5" },
    },
    {
      key: "computeTime",
      label: "Compute time",
      unit: "ms",
      kind: "distribution",
      help: "The handler's own work in each invocation, not counting the calls it makes. In AWS, more memory brings more CPU, which can shorten it; memory size isn't modeled (LMB-7).",
      evidence: { level: "assumption", fidelityId: undefined },
    },
  ],
};
