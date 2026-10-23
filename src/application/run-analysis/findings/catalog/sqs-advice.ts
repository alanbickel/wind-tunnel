import { FAILED_DELIVERIES } from "../detectors/failed-deliveries";
import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// Readings: findings.md §1.4 and §1.5, sentences 5 to 8, and §1.8,
// sentences 9 to 12. AWS links checked 2026-10-21.

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
  kinds: {
    [FAILED_DELIVERIES]: {
      fixes: [
        {
          scope: "wind-tunnel",
          message: say`Let every consumer hold what its delivery needs downstream, such as a database connection: with Template B's orders-db cut to 10 connections for 15 consumers, the lunch rush fails no delivery at maxConnections 15.`,
          claim: {
            kind: "observed",
            file: "src/adapters/templates/scenarios/failed-deliveries.test.ts",
            test: "fails no delivery when every consumer can hold a connection",
          },
          fidelityIds: ["LMB-8"],
        },
        {
          scope: "wind-tunnel",
          message: say`Shrinking consumerMaxConcurrency to fit what's downstream is worse: in the same run at 10 consumers, no delivery fails, but messages arrive faster than they're delivered, and some are still waiting when the run ends.`,
          claim: {
            kind: "observed",
            file: "src/adapters/templates/scenarios/failed-deliveries.test.ts",
            test: "leaves messages waiting when the consumers shrink to fit",
          },
          fidelityIds: ["SQS-3", "SQS-4"],
        },
        {
          scope: "aws",
          message: say`Set a redrive policy with maxReceiveCount of at least 5 and a dead-letter queue, and watch the dead-letter queue: a message that keeps failing then moves there instead of being received again and again.`,
          claim: {
            kind: "documented",
            title: "Creating and configuring an SQS event source mapping",
            url: "https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html",
          },
          fidelityIds: ["SQS-1"],
        },
      ],
      learnMore:
        "a-failed-sqs-message-waits-out-the-visibility-timeout-before-its-retried",
    },
  },
};
