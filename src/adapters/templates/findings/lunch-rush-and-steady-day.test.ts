import {
  backlog,
  describeFindings,
  failedRequests,
  waitingHoldsLimit,
} from "../testing/describe-findings";
import { projectA, projectB } from "../testing/scenario-runs";

// The shorter workloads, for both templates. Why these tests exist is in
// `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template A, lunch rush",
    project: projectA,
    workloadId: "lunch-rush",
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
  },
  {
    name: "Template A, steady day",
    project: projectA,
    workloadId: "steady-day",
    reading: "1.3",
    findings: [],
  },
  {
    name: "Template B, lunch rush",
    project: projectB,
    workloadId: "lunch-rush",
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
  },
  {
    name: "Template B, steady day",
    project: projectB,
    workloadId: "steady-day",
    reading: "1.6",
    findings: [],
  },
]);
