import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { projectA } from "../testing/scenario-runs";

// Template A's long rush, in its own file so the long runs go to different
// test workers. Why these tests exist is in
// `../testing/describe-rejection-reasons.ts`.

describeRejectionReasons([
  {
    name: "Template A, long rush",
    project: projectA,
    workloadId: "long-rush",
    rejectedAs: ["orders-db: too-many-connections"],
  },
]);
