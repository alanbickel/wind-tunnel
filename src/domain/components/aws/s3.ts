import { z } from "zod";
import { oneSecondOf } from "../../behaviors/token-bucket";
import { distributionSchema } from "../../random/distribution";
import type { RefuseWhenFull } from "../component-behavior";
import { rateLimitedServiceDefinition } from "../rate-limited-service";
import { AWS_EDGE_DEFAULTS } from "./edge-defaults";

const s3Config = z.object({
  /** `GET` and `HEAD` requests a second the prefix serves before `503 Slow Down`. */
  readsPerSec: z.number().positive(),
  /** `PUT`, `COPY`, `POST`, and `DELETE` requests a second, likewise. */
  writesPerSec: z.number().positive(),
  /** How long S3 takes to answer a read its rate allows. */
  readLatency: distributionSchema,
  /** How long S3 takes to answer a write its rate allows. */
  writeLatency: distributionSchema,
});
export type S3Config = z.infer<typeof s3Config>;

/** Rejects a request over the prefix's rate, as S3's `503 Slow Down`. */
const SLOW_DOWN: RefuseWhenFull = { kind: "refuse", reason: "slow-down" };

/**
 * Amazon S3: one partitioned prefix of a general purpose bucket, in S3
 * Standard. A token bucket for reads and one for writes, then a latency
 * drawn for the action. Over a rate, S3 answers `503 Slow Down`.
 *
 * A component is one prefix (S3-1): a bucket whose keys spread across
 * prefixes is several components. Each rate is fixed for the run (S3-2),
 * although S3 raises a busy prefix's rate on its own, gradually; and each
 * bucket holds one second of requests and starts full (S3-3), since AWS
 * exposes no burst. See docs/design/fidelity/s3/s3-fidelity.md.
 */
export const s3Definition = rateLimitedServiceDefinition({
  type: "s3",
  displayName: "S3",
  configSchema: s3Config,
  defaultConfig: {
    readsPerSec: 5_500,
    writesPerSec: 3_500,
    readLatency: { kind: "lognormal", medianMs: 20, p99Ms: 150 },
    writeLatency: { kind: "lognormal", medianMs: 30, p99Ms: 200 },
  },
  edgeDefaults: AWS_EDGE_DEFAULTS,
  refusal: SLOW_DOWN,
  // A 503 SlowDown (ADR-0025 decision 7).
  refusalKind: "throttling",
  limits: {
    readRate: ({ readsPerSec }) => oneSecondOf(readsPerSec),
    writeRate: ({ writesPerSec }) => oneSecondOf(writesPerSec),
  },
  actions: {
    read: { limit: "readRate", serviceTime: "readLatency" },
    write: { limit: "writeRate", serviceTime: "writeLatency" },
  },
});
