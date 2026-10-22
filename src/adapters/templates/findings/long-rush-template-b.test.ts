import { describeFindings } from "../testing/describe-findings";
import { projectB } from "../testing/scenario-runs";

// Template B's long rush, in its own file so the long runs go to different
// test workers. Why these tests exist is in `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template B, long rush",
    project: projectB,
    workloadId: "long-rush",
    reading: "1.5",
    findingIds: ["late-async-work:orders-queue"],
  },
]);
