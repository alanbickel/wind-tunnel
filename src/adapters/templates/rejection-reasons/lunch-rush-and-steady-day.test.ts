import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { projectA, projectB } from "../testing/scenario-runs";

// The shorter workloads, for both templates. Why these tests exist is in
// `../testing/describe-rejection-reasons.ts`.

describeRejectionReasons([
  {
    name: "Template A, lunch rush",
    project: projectA,
    workloadId: "lunch-rush",
    rejectedAs: ["orders-db: too-many-connections"],
  },
  {
    name: "Template A, steady day",
    project: projectA,
    workloadId: "steady-day",
    rejectedAs: [],
  },
  {
    name: "Template B, lunch rush",
    project: projectB,
    workloadId: "lunch-rush",
    rejectedAs: [],
  },
  {
    name: "Template B, steady day",
    project: projectB,
    workloadId: "steady-day",
    rejectedAs: [],
  },
]);
