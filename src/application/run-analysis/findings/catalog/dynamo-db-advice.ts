import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// Readings: findings.md §1.7, sentences 3, 5, and 6. AWS links checked
// 2026-10-21.

export const dynamoDbAdvice: TypeAdvice = {
  type: "dynamodb",
  limits: {
    readUnits: {
      fixes: [
        {
          scope: "wind-tunnel",
          message: say`Provision readUnitsPerSec for the sustained read rate, not the burst: a bucket that refills slower than reads arrive runs out however large it is. Template B's long rush fails nothing at 2,500.`,
          claim: {
            kind: "observed",
            file: "src/adapters/templates/scenarios/long-rush-template-b.test.ts",
            test: "serves every request without a failure",
          },
          fidelityIds: ["DDB-1", "DDB-2"],
        },
        {
          scope: "aws",
          message: say`Look for throttles in latency, not only in errors: the AWS SDKs retry throttled requests on their own, so a throttle may reach your code only as a slower answer.`,
          claim: {
            kind: "documented",
            title: "DynamoDB error handling",
            url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html",
          },
          fidelityIds: ["DDB-4"],
        },
      ],
      learnMore: "dynamodb-saves-up-unused-capacity-for-bursts",
    },
  },
  kinds: {},
  wording: {
    reasons: {
      throttled: { long: "throttled", short: "throttled" },
    },
    limits: {
      readUnits: { long: "readUnits", short: "readUnits" },
      writeUnits: { long: "writeUnits", short: "writeUnits" },
    },
  },
};
