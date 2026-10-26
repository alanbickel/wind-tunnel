import type { TypeFields } from "../field-descriptor";

export const apiGatewayFields: TypeFields = {
  type: "api-gateway",
  fields: [
    {
      key: "ratePerSec",
      label: "Rate",
      unit: "requests/s",
      kind: "number",
      range: { min: 0, minExclusive: true, max: undefined },
      help: "Requests a second, held steady, before API Gateway throttles the rest with HTTP 429. In AWS, the account's limit per Region, shared by every API in it, unless a stage, method, or usage plan sets a lower one (APIGW-1).",
      evidence: { level: "documented", fidelityId: "APIGW-1" },
    },
    {
      key: "burst",
      label: "Burst",
      unit: "requests",
      kind: "whole-number",
      range: { min: 1, minExclusive: false, max: undefined },
      help: "Requests that can arrive at once after a quiet period, above the steady rate. In AWS, the account's burst limit per Region, shared like the rate (APIGW-1).",
      evidence: { level: "documented", fidelityId: "APIGW-1" },
    },
    {
      key: "overhead",
      label: "Overhead",
      unit: "ms",
      kind: "distribution",
      help: "API Gateway's own time for each request, before it calls the integration. AWS doesn't publish it; CloudWatch's Latency minus IntegrationLatency shows yours (APIGW-4).",
      evidence: { level: "assumption", fidelityId: "APIGW-4" },
    },
  ],
};
