import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// No template's function reaches its request rate, so no run backs an
// Observed claim: the fix is Documented. AWS link checked 2026-11-20.
// `concurrency` has words but no fix yet.

export const lambdaAdvice: TypeAdvice = {
  type: "lambda",
  limits: {
    requestRate: {
      fixes: [
        {
          scope: "aws",
          message: say`Raise the function's concurrency, not its speed: Lambda allows 10 invocations a second for each unit of concurrency, so a function shorter than 100 ms runs out of requests per second before it runs out of concurrency, and making it faster doesn't help. In AWS, that means more reserved concurrency, or a higher account limit.`,
          claim: {
            kind: "documented",
            title: "Lambda concurrency and requests per second",
            url: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html#concurrency-vs-requests-per-second",
          },
          fidelityIds: ["LMB-1", "LMB-10"],
        },
      ],
      learnMore:
        "fast-lambda-functions-hit-a-request-rate-limit-before-concurrency",
    },
  },
  kinds: {},
  wording: {
    reasons: {
      throttled: { long: "throttled", short: "throttled" },
    },
    limits: {
      concurrency: { long: "concurrency", short: "concurrency" },
      requestRate: { long: "requestRate", short: "requestRate" },
    },
  },
};
