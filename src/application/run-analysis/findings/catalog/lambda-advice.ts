import type { TypeAdvice } from "./type-advice";

// No advice yet: only the words for its own IDs.

export const lambdaAdvice: TypeAdvice = {
  type: "lambda",
  limits: {},
  kinds: {},
  wording: {
    reasons: {
      throttled: { long: "throttled", short: "throttled" },
    },
    limits: {
      concurrency: { long: "concurrency", short: "concurrency" },
    },
  },
};
