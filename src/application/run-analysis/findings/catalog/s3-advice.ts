import type { Fix } from "../finding";
import { say } from "../message";
import type { TypeAdvice } from "./type-advice";

// No template uses S3, so no run backs an Observed claim: every fix is
// Documented, from the sources of S3's fidelity profile. AWS links checked
// 2026-11-19. Both rates are per prefix and refuse the same way, so each
// fix applies to both.

const SPREAD_ACROSS_PREFIXES: Fix = {
  scope: "aws",
  message: say`Spread the keys across more prefixes: each partitioned prefix has its own rate, so 10 prefixes serve 10 times the requests. In Wind Tunnel, model each prefix as its own S3 component.`,
  claim: {
    kind: "documented",
    title: "S3 performance guidelines",
    url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html",
  },
  fidelityIds: ["S3-1"],
};

const RAMP_UP_GRADUALLY: Fix = {
  scope: "aws",
  message: say`Ramp up to a new request rate gradually: S3 raises a busy prefix's rate on its own, but not instantly, and refuses some requests until it has. Wind Tunnel holds the rate fixed, so a long run over it fails more than AWS would.`,
  claim: {
    kind: "documented",
    title: "S3 performance design patterns",
    url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html",
  },
  fidelityIds: ["S3-2"],
};

const SDKS_RETRY_SLOW_DOWN: Fix = {
  scope: "aws",
  message: say`Look for 503 Slow Down in latency, not only in errors: the AWS SDKs retry it as a throttling error, three attempts by default, so it may reach your code only as a slower answer. Give the calling edge the AWS SDK standard retries to see it here.`,
  claim: {
    kind: "documented",
    title: "AWS SDKs retry behavior",
    url: "https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html",
  },
  fidelityIds: ["ENG-2"],
};

const BUCKET_KEYS: Fix = {
  scope: "aws",
  message: say`If the bucket uses SSE-KMS, turn on S3 Bucket Keys: without one, each request also calls KMS, whose quota is shared by the whole account, and can be throttled there before S3's rate. Not modeled.`,
  claim: {
    kind: "documented",
    title: "S3 Bucket Keys",
    url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html",
  },
  fidelityIds: ["S3-7"],
};

const RATE_ADVICE = {
  fixes: [
    SPREAD_ACROSS_PREFIXES,
    RAMP_UP_GRADUALLY,
    SDKS_RETRY_SLOW_DOWN,
    BUCKET_KEYS,
  ],
  learnMore: "s3s-request-rate-is-per-prefix-and-it-grows-only-gradually",
};

export const s3Advice: TypeAdvice = {
  type: "s3",
  limits: {
    readRate: RATE_ADVICE,
    writeRate: RATE_ADVICE,
  },
  kinds: {},
  wording: {
    reasons: {
      "slow-down": { long: "slow-down", short: "slow-down" },
    },
    limits: {
      readRate: { long: "readRate", short: "readRate" },
      writeRate: { long: "writeRate", short: "writeRate" },
    },
  },
};
