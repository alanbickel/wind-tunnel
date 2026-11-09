import { describe } from "vitest";
import {
  describeBacklogAtEnd,
  twelveConsumers,
} from "../findings/backlog-at-end.suite";
import { READING_SEED } from "../testing/scenario-runs";
import { useRun } from "../testing/use-run";

describe("Template B, lunch rush, 12 consumers", () => {
  const run = useRun({
    project: twelveConsumers,
    workloadId: "lunch-rush",
    seed: READING_SEED,
  });
  describeBacklogAtEnd(run);
});
