import { z } from "zod";

// The stored and exported project format, version 1 (MVP design §6,
// ADR-0004). This schema checks shapes and number ranges only. Rules that
// span the project (unique IDs, references, steps following edges) belong to
// `validateProject`, and each component's `config` to its definition
// (`validateComponents`); `loadProject` runs all three.
//
// Objects are strict: an unknown key is an error, so a typo in a template
// (`latencyMS`) fails loudly instead of being dropped.

const id = z.string().min(1);
const name = z.string().min(1);
const timestamp = z.iso.datetime({ offset: true });

const retryPolicySchema = z.strictObject({
  maxAttempts: z.number().int().min(1).max(10),
  backoff: z.enum(["none", "exponential", "exponential-jitter"]),
  baseDelayMs: z.number().nonnegative(),
});

const componentSchema = z.strictObject({
  id,
  type: z.string().min(1),
  name,
  /** Validated against the type's component definition, not here. */
  config: z.record(z.string(), z.unknown()),
});

const edgeSchema = z.strictObject({
  id,
  from: id,
  to: id,
  latencyMs: z.number().nonnegative(),
  timeoutMs: z.number().positive(),
  retry: retryPolicySchema,
});

const stepSchema = z.strictObject({
  componentId: id,
  action: z.enum(["invoke", "read", "write", "enqueue"]),
  get calls() {
    return z.array(stepSchema).optional();
  },
  get async() {
    return stepSchema.optional();
  },
});

const workflowSchema = z.strictObject({ id, name, root: stepSchema });

const workloadSchema = z.strictObject({
  id,
  name,
  durationSec: z.number().positive(),
  /** Only the low 32 bits are used, so keep seeds in that range. */
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  mix: z.array(
    z.strictObject({ workflowId: id, weight: z.number().positive() }),
  ),
  profile: z.array(
    z.strictObject({
      atSec: z.number().nonnegative(),
      requestsPerSec: z.number().nonnegative(),
    }),
  ),
});

const pointSchema = z.strictObject({ x: z.number(), y: z.number() });

export const projectDocumentV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  name,
  description: z.string().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Set when the project was created from a template. */
  source: z
    .strictObject({
      templateId: id,
      templateVersion: z.number().int().min(1),
    })
    .optional(),
  architecture: z.strictObject({
    components: z.array(componentSchema),
    edges: z.array(edgeSchema),
  }),
  workflows: z.array(workflowSchema),
  workloads: z.array(workloadSchema),
  /** Canvas positions, keyed by component ID. Not part of the domain. */
  layout: z.strictObject({ nodes: z.record(z.string(), pointSchema) }),
});

export type ProjectDocumentV1 = z.infer<typeof projectDocumentV1Schema>;
export type StepDocument = z.infer<typeof stepSchema>;
