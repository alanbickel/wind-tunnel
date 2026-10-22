import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// Readings: findings.md §1.4 and §1.5, sentences 5 to 8. AWS links checked
// 2026-10-21.

const SQS_SCALING = {
  kind: "documented",
  title: "SQS scaling",
  url: "https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html",
} as const;

export const sqsAdvice: TypeAdvice = {
  type: "sqs",
  limits: {
    consumerConcurrency: {
      fixes: [
        {
          scope: "wind-tunnel",
          message: say`Raise consumerMaxConcurrency, so the consumers keep up with the messages arriving: Template B's long rush keeps up at 20.`,
          claim: {
            kind: "observed",
            file: "src/adapters/templates/scenarios/long-rush-template-b.test.ts",
            test: "grows the backlog through the whole peak",
          },
          fidelityIds: ["SQS-3", "SQS-4"],
        },
        {
          scope: "wind-tunnel",
          message: say`Check what the consumers call before raising it: each delivery holds capacity downstream, such as a database connection, so more consumers can move the wait there.`,
          claim: { kind: "assumption" },
          fidelityIds: [],
        },
        {
          scope: "aws",
          message: say`Raise the event source mapping's maximum concurrency (2 to 1,000), and keep the function's reserved concurrency at least as high, or Lambda might throttle the messages.`,
          claim: SQS_SCALING,
          fidelityIds: ["SQS-3", "SQS-4"],
        },
        {
          scope: "aws",
          message: say`Watch the queue's ApproximateAgeOfOldestMessage in CloudWatch: the age of the oldest unprocessed message shows a backlog while it builds.`,
          claim: {
            kind: "documented",
            title: "SQS CloudWatch metrics",
            url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html",
          },
          fidelityIds: [],
        },
      ],
      learnMore: "sqs-messages-expire-if-the-backlog-lasts-too-long",
    },
  },
};
