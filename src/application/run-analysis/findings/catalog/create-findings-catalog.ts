import { apiGatewayAdvice } from "./api-gateway-advice";
import { dynamoDbAdvice } from "./dynamo-db-advice";
import { lambdaAdvice } from "./lambda-advice";
import { rdsAdvice } from "./rds-advice";
import { sqsAdvice } from "./sqs-advice";
import type { FindingsCatalog, TypeAdvice } from "./type-advice";

/** Every type's advice. A new type adds a file and one line here. */
const ADVICE: readonly TypeAdvice[] = [
  apiGatewayAdvice,
  lambdaAdvice,
  rdsAdvice,
  sqsAdvice,
  dynamoDbAdvice,
];

/**
 * The default catalog of fixes, keyed by component type and limit or
 * finding kind, with each type's words for its own IDs.
 */
export function createFindingsCatalog(): FindingsCatalog {
  return new Map(ADVICE.map((advice) => [advice.type, advice]));
}
