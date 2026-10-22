import {
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
              "Its connections ran out in 33 seconds from 14 s to 47 s, 3 s after the waiting began at 11 s.",
              "While its connections were out, orders-db finished 896 requests a second on average, against 1,770 arriving.",
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
    findings: [],
  },
  {
    name: "Template B, steady day",
    project: projectB,
    workloadId: "steady-day",
    reading: "1.6",
    findings: [],
  },
]);
