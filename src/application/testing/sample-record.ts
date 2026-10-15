import {
  apiGatewayDefinition,
  dynamoDbDefinition,
  lambdaDefinition,
} from "../../domain/components/aws";
import type { Edge } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";

const retry: Edge["retry"] = {
  maxAttempts: 1,
  backoff: "none",
  baseDelayMs: 0,
};

/**
 * A small, valid project record (API Gateway → Lambda → DynamoDB) with every
 * optional field filled in, so round-trip tests notice a dropped field. It
 * uses each type's default config, so it passes `validateComponents` with
 * the AWS registry.
 */
export const sampleRecord: ProjectRecord = {
  project: {
    id: "sample",
    name: "Sample project",
    description: "A small project for tests.",
    architecture: {
      components: [
        {
          id: "api",
          type: "api-gateway",
          name: "API",
          config: apiGatewayDefinition.defaultConfig,
        },
        {
          id: "fn",
          type: "lambda",
          name: "Function",
          config: lambdaDefinition.defaultConfig,
        },
        {
          id: "table",
          type: "dynamodb",
          name: "Table",
          config: dynamoDbDefinition.defaultConfig,
        },
      ],
      edges: [
        {
          id: "api-fn",
          from: "api",
          to: "fn",
          latencyMs: 1,
          timeoutMs: 29_000,
          retry,
        },
        {
          id: "fn-table",
          from: "fn",
          to: "table",
          latencyMs: 2,
          timeoutMs: 1_000,
          retry: { maxAttempts: 3, backoff: "exponential", baseDelayMs: 50 },
        },
      ],
    },
    workflows: [
      {
        id: "read",
        name: "Read item",
        root: {
          componentId: "api",
          action: "invoke",
          calls: [
            {
              componentId: "fn",
              action: "invoke",
              calls: [{ componentId: "table", action: "read" }],
            },
          ],
        },
      },
    ],
    workloads: [
      {
        id: "steady",
        name: "Steady",
        durationMs: 5_000,
        seed: 1,
        mix: [{ workflowId: "read", weight: 1 }],
        profile: [{ atMs: 0, requestsPerSec: 20 }],
      },
    ],
  },
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-02T09:30:00.000Z",
  source: { templateId: "template-x", templateVersion: 2 },
  layout: {
    nodes: {
      api: { x: 0, y: 0 },
      fn: { x: 250, y: 0 },
      table: { x: 500, y: 0 },
    },
  },
};
