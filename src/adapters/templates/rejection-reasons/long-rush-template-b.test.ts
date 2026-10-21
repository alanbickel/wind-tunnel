import { describeRejectionReasons } from "../testing/describe-rejection-reasons";
import { projectB } from "../testing/scenario-runs";

// Template B's long rush, in its own file so the long runs go to different
// test workers. Why these tests exist is in
// `../testing/describe-rejection-reasons.ts`.

describeRejectionReasons([
  {
    name: "Template B, long rush",
    project: projectB,
    workloadId: "long-rush",
    rejectedAs: [],
  },
]);
