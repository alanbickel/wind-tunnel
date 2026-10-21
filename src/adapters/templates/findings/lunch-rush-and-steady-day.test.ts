import { describeFindings } from "../testing/describe-findings";
import { projectA, projectB } from "../testing/scenario-runs";

// The shorter workloads, for both templates. Why these tests exist is in
// `../testing/describe-findings.ts`.

describeFindings([
  {
    name: "Template A, lunch rush",
    project: projectA,
    workloadId: "lunch-rush",
    reading: "1.1",
    findingIds: ["failed-requests:orders-db: too-many-connections"],
  },
  {
    name: "Template A, steady day",
    project: projectA,
    workloadId: "steady-day",
    reading: "1.3",
    findingIds: [],
  },
  {
    name: "Template B, lunch rush",
    project: projectB,
    workloadId: "lunch-rush",
    reading: "1.4",
    findingIds: [],
  },
  {
    name: "Template B, steady day",
    project: projectB,
    workloadId: "steady-day",
    reading: "1.6",
    findingIds: [],
  },
]);
