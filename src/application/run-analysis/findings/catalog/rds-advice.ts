import type { Fix } from "../finding";
import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// Readings: findings.md §1.1, sentences 7 to 12. AWS links checked
// 2026-10-21. Advice that holds only when waiting queries hold the
// connections (§1.1.3) is queryWorkers', so it shows under waiting-holds-
// limit's note and not where the connections ran out on their own (§1.8.8).

const LUNCH_RUSH_TEST = {
  kind: "observed",
  file: "src/adapters/templates/scenarios/lunch-rush.test.ts",
  test: "fails requests in every second of the peak",
} as const;

const RAISE_QUERY_WORKERS: Fix = {
  scope: "wind-tunnel",
  message: say`Raise queryWorkers, so queries stop waiting for a worker. A waiting query holds its connection, so the connections run out only while the workers are full: Template A's lunch rush fails nothing at 64.`,
  claim: LUNCH_RUSH_TEST,
  fidelityIds: ["RDS-2", "RDS-3"],
};

const MORE_CONNECTIONS_ALONE: Fix = {
  scope: "wind-tunnel",
  message: say`Raising maxConnections alone moves the failure upstream: in Template A's lunch rush at 5,000, waiting queries hold all of fn-orders' concurrency, and Lambda throttles instead.`,
  claim: LUNCH_RUSH_TEST,
  fidelityIds: ["RDS-2"],
};

const LARGER_INSTANCE: Fix = {
  scope: "aws",
  message: say`Move to a larger DB instance class, with more CPU and memory. That more CPU serves proportionally more queries a second is an assumption.`,
  claim: {
    kind: "documented",
    title: "DB instance classes",
    url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html",
  },
  fidelityIds: ["RDS-2"],
};

const READ_REPLICAS: Fix = {
  scope: "aws",
  message: say`Move reads to read replicas, which scale out beyond one instance for read-heavy workloads. They replicate asynchronously, so a read may be stale. Not modeled.`,
  claim: {
    kind: "documented",
    title: "Working with read replicas",
    url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html",
  },
  fidelityIds: ["RDS-6"],
};

const NOT_RDS_PROXY: Fix = {
  scope: "aws",
  message: say`RDS Proxy alone isn't a fix: it makes a request wait for a pooled connection, up to ConnectionBorrowTimeout (120 s by default), instead of refusing it, but adds no query capacity. Not modeled.`,
  claim: {
    kind: "documented",
    title: "RDS Proxy connection settings",
    url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-connections.html",
  },
  fidelityIds: ["RDS-6"],
};

export const rdsAdvice: TypeAdvice = {
  type: "rds",
  limits: {
    connections: {
      fixes: [LARGER_INSTANCE, READ_REPLICAS],
      learnMore: "rds-connection-limits-depend-on-instance-size",
    },
    queryWorkers: {
      fixes: [
        RAISE_QUERY_WORKERS,
        MORE_CONNECTIONS_ALONE,
        LARGER_INSTANCE,
        READ_REPLICAS,
        NOT_RDS_PROXY,
      ],
      learnMore: undefined,
    },
  },
  kinds: {},
};
