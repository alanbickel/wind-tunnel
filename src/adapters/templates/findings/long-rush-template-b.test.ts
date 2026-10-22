import {
  backlog,
  describeFindings,
  lateAsyncWork,
} from "../testing/describe-findings";
import { projectB } from "../testing/scenario-runs";

// Template B's long rush, in its own file so the long runs go to different
// test workers. Why these tests exist is in `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template B, long rush",
    project: projectB,
    workloadId: "long-rush",
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
  },
]);
