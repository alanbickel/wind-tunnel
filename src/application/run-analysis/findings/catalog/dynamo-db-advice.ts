import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// Readings: findings.md §1.7, sentences 4, 6, and 7. AWS links checked
// 2026-10-21.

export const dynamoDbAdvice: TypeAdvice = {
  type: "dynamodb",
  limits: {
    readUnits: {
      fixes: [
        {
          scope: "wind-tunnel",
          message: say`Provision readUnitsPerSec for the units your sustained reads take a second, not for the burst. A read takes one unit per started 4 KB of its item, half that if eventually consistent, so the bucket counts units, not reads. A bucket that refills slower than reads take units runs out however large it is; at or above that rate, nothing is throttled.`,
          claim: {
            kind: "observed",
            test: "serves every request of the long rush without a failure",
          },
          fidelityIds: ["DDB-2"],
        },
        {
          scope: "aws",
          message: say`Look for throttles in latency, not only in errors: the AWS SDKs retry throttled requests on their own, so a throttle may reach your code only as a slower answer.`,
          claim: {
            kind: "documented",
            title: "DynamoDB error handling",
            url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html",
          },
          fidelityIds: ["ENG-2"],
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
