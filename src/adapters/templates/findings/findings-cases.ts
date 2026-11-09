import type { FindingsCase } from "../testing/describe-findings";
import {
  backlog,
  bucketDrained,
  failedDeliveries,
  failedRequests,
  lateAsyncWork,
  retriesAbsorbed,
  waitingHoldsLimit,
} from "../testing/describe-findings";

// What the findings of each run should be, and how its verdict is checked.
// Each run is in its file in `../runs/`, which gives the case to
// `describeFindings`. Why the checks exist is in
// `../testing/describe-findings.ts`.

export const TEMPLATE_A_LUNCH_RUSH: FindingsCase = {
  name: "Template A, lunch rush",
  reading: "1.1",
  findings: [
    {
      key: failedRequests("orders-db", "too-many-connections"),
      causes: [
        {
          key: waitingHoldsLimit("orders-db", "queryWorkers"),
          causeFromMs: 11_000,
          // findings.md §1.1, sentences 3 and 4.
          sentences: [
            "Requests waited for orders-db's queryWorkers, holding its connections while they waited.",
            "All 16 of its queryWorkers were busy in every second from 11 s to 49 s, so requests arriving then waited for one. They were also all busy in 1 other second.",
            "Each waiting request holds one of its connections: 16 running and up to 74 waiting is 90, and its connections peaked at 90 of 90.",
            "Its connections ran out while its queryWorkers were all busy in 33 seconds from 14 s to 47 s, 3 s after the waiting began at 11 s.",
            "While its queryWorkers were all busy and its connections were out, orders-db finished 896 requests a second on average, against 1,770 arriving.",
          ],
        },
      ],
    },
  ],
};

export const TEMPLATE_A_STEADY_DAY: FindingsCase = {
  name: "Template A, steady day",
  reading: "1.3",
  findings: [],
};

export const TEMPLATE_B_LUNCH_RUSH: FindingsCase = {
  name: "Template B, lunch rush",
  reading: "1.4",
  findings: [
    {
      key: backlog("orders-queue", "consumerConcurrency"),
      causeFromMs: 15_000,
      // findings.md §1.4, sentences 1 to 3.
      sentences: [
        "Messages waited for orders-queue's consumerConcurrency from 17 s, and its backlog was empty by 54 s.",
        "All 15 of its consumerConcurrency were busy in every second from 15 s to 54 s, so messages arriving then waited for one. They were also all busy in 1 other second.",
        "It peaked at 1,937 messages in the second ending at 43 s. From 17 s to then, messages arrived at 385 a second and were delivered at 312, so it grew by about 73 a second.",
        "Deliveries in those seconds landed up to 6.2 s after their requests; the highest p99 of a second was 6.2 s.",
      ],
    },
  ],
};

export const TEMPLATE_B_STEADY_DAY: FindingsCase = {
  name: "Template B, steady day",
  reading: "1.6",
  findings: [],
};

export const TEMPLATE_A_LONG_RUSH: FindingsCase = {
  name: "Template A, long rush",
  reading: "1.2",
  findings: [
    {
      key: failedRequests("orders-db", "too-many-connections"),
      causes: [
        {
          key: waitingHoldsLimit("orders-db", "queryWorkers"),
          causeFromMs: 11_000,
        },
      ],
    },
  ],
};

export const TEMPLATE_B_LONG_RUSH: FindingsCase = {
  name: "Template B, long rush",
  reading: "1.5",
  findings: [
    {
      key: lateAsyncWork("orders-queue"),
      causes: [
        {
          key: backlog("orders-queue", "consumerConcurrency"),
          causeFromMs: 15_000,
          // findings.md §1.5, sentence 1.
          sentences: [
            "Messages waited for orders-queue's consumerConcurrency from 17 s, and its backlog was empty by 184 s.",
            "All 15 of its consumerConcurrency were busy in every second from 15 s to 184 s, so messages arriving then waited for one. They were also all busy in 1 other second.",
            "It peaked at 10,197 messages in the second ending at 142 s. From 17 s to then, messages arrived at 395 a second and were delivered at 314, so it grew by about 81 a second.",
            "Deliveries in those seconds landed up to 32.8 s after their requests; the highest p99 of a second was 32.8 s.",
          ],
        },
      ],
    },
  ],
};

// findings.md §1.7: Template B's long rush with orders-read's read capacity
// cut to 1,500 a second. Its reads are throttled and retried, so refused
// attempts outnumber failed requests, and the failures must still add up.
// The drained read bucket shows beneath the failure, from 18 s (§1.7.2),
// and the retries that got most reads through are a note of their own
// (§1.7.3).
export const READ_CAPACITY_1500: FindingsCase = {
  name: "Template B, long rush, read capacity 1,500",
  reading: "1.7",
  findings: [
    {
      key: failedRequests("orders-read", "throttled"),
      causes: [
        {
          key: bucketDrained("orders-read", "readUnits"),
          causeFromMs: 18_000,
          // findings.md §1.7, sentence 2.
          sentences: [
            "orders-read's readUnits bucket drained from 18 s and ran out in the second ending at 96 s.",
            "It was last full at 18 s. From then, requests took 1,595 tokens a second on average, against a refill of 1,500.",
            "Its burst of 7,500 tokens lasted between 77 s and 78 s.",
            "At that flow, a full bucket lasts about 78.9 s: (burst − 1) ÷ (flow − refill).",
          ],
        },
      ],
    },
    {
      key: lateAsyncWork("orders-queue"),
      causes: [
        {
          key: backlog("orders-queue", "consumerConcurrency"),
          causeFromMs: 15_000,
        },
      ],
    },
    {
      key: retriesAbsorbed("orders-read"),
      // findings.md §1.7, sentence 3: Get order's p99 rose while reads
      // were throttled.
      sentences: [
        "orders-read refused 64,201 attempts, but only 4,377 requests failed with its rejections: callers retried the rest.",
        "It refused attempts in 46 seconds from 95 s to 141 s.",
        "Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.",
        "It refuses only with throttled, so the attempts and the requests are both throttled rejections.",
        "While it refused attempts, Get order's p99 was 185 ms in the median second, and up to 445 ms, against 108 ms in the median second before.",
      ],
    },
  ],
};

// findings.md §1.8: Template B with orders-db cut to 10 connections, fewer
// than orders-queue's 15 consumers. orders-db refuses some deliveries, and
// the queue tries each again, so no request fails. The failed deliveries
// are a note at orders-db, and retries-absorbed doesn't fire: no caller
// retried (§1.8.8). The verdict names the connections, which ran out and
// refused, instead of quoting their 100% as headroom (§3.4).

const cause = failedDeliveries("orders-db", "too-many-connections");
export const LUNCH_RUSH_10_CONNECTIONS: FindingsCase = {
  name: "Template B, lunch rush, 10 database connections",
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
};

export const LONG_RUSH_10_CONNECTIONS: FindingsCase = {
  name: "Template B, long rush, 10 database connections",
  // findings.md §1.8, "The long rush": Degraded by the late writes, with
  // the failed deliveries a note beside them.
  verdict: [
    "Degraded. All 273,539 answered requests succeeded, but work queued in orders-queue finished past the 29 s API Gateway waits for fn-api; 7 were still in progress when the run ended.",
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
};
