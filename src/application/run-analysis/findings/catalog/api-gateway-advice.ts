import type { TypeAdvice } from "./type-advice";

// No advice yet: only the words for its own IDs.

export const apiGatewayAdvice: TypeAdvice = {
  type: "api-gateway",
  limits: {},
  kinds: {},
  wording: {
    reasons: {
      throttled: { long: "throttled", short: "throttled" },
    },
    limits: {
      requestRate: { long: "requestRate", short: "requestRate" },
    },
  },
};
