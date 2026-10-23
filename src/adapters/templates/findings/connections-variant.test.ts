import {
  backlog,
  describeFindings,
  failedDeliveries,
  lateAsyncWork,
} from "../testing/describe-findings";
import { withMaxConnections } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";

// findings.md §1.8: Template B with orders-db cut to 10 connections, fewer
// than orders-queue's 15 consumers. orders-db refuses some deliveries, and
// the queue tries each again, so no request fails. The failed deliveries
// are a note at orders-db, and retries-absorbed doesn't fire: no caller
// retried (§1.8.8). The verdict names the connections, which ran out and
// refused, instead of quoting their 100% as headroom (§3.4).
// Why these tests exist is in `../testing/describe-findings.ts`.

const project = withMaxConnections(projectB, 10);
const cause = failedDeliveries("orders-db", "too-many-connections");

describeFindings([
  {
    name: "Template B, lunch rush, 10 database connections",
    project,
    workloadId: "lunch-rush",
    reading: "1.8",
    findings: [
      {
        key: cause,
        // findings.md §1.8, sentences 1, 2, 5 (its first half), 6, and 7.
        sentences: [
          "orders-db refused 90 deliveries from orders-queue with too-many-connections in 33 seconds from 16 s to 53 s, and each went back to be tried again.",
          "That's 90 of orders-queue's 13,191 delivery attempts (0.6%). Of those, 13,097 were delivered, 90 failed, and 4 were still being delivered.",
          "A failed delivery waits in the backlog again: orders-queue had up to 1,970 messages waiting in a second with one of these failures.",
          "orders-db held all 10 of its connections in every second with these failures.",
          "orders-db refused 90 attempts, and each one failed a delivery.",
          "The last failed in the second ending at 53 s, and none failed in the 7 s after it.",
          "At the end of the last second, orders-queue had no messages waiting.",
        ],
      },
      {
        key: backlog("orders-queue", "consumerConcurrency"),
        causeFromMs: 15_000,
      },
    ],
  },
  {
    name: "Template B, long rush, 10 database connections",
    project,
    workloadId: "long-rush",
    // findings.md §1.8, "The long rush": Degraded by the late writes, with
    // the failed deliveries a note beside them.
    verdict: [
      "Degraded. All 273,539 answered requests succeeded, but 1 finding is a warning; 7 were still in progress when the run ended.",
      "No headroom: orders-db connections ran out in 170 seconds from 14 s to 185 s, and orders-db refused 445 attempts; no request failed with its rejections.",
      "Closest to failing: fn-api concurrency, at most 104 of 1,000 (10.4%) from 70 s to 71 s, while fn-api had 3 cold starts; at most 99 of 1,000 (9.9%) in the seconds without cold starts.",
    ].join("\n"),
    findings: [
      {
        key: lateAsyncWork("orders-queue"),
        causes: [
          {
            key: backlog("orders-queue", "consumerConcurrency"),
            causeFromMs: 15_000,
          },
        ],
      },
      { key: cause },
    ],
  },
]);
