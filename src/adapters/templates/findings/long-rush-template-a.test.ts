import { describeFindings } from "../testing/describe-findings";
import { projectA } from "../testing/scenario-runs";

// Template A's long rush, in its own file so the long runs go to different
// test workers. Why these tests exist is in `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template A, long rush",
    project: projectA,
    workloadId: "long-rush",
    reading: "1.2",
    findingIds: ["failed-requests:orders-db: too-many-connections"],
  },
]);
