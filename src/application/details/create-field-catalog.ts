import type { FieldCatalog, TypeFields } from "./field-descriptor";
import { apiGatewayFields } from "./fields/api-gateway-fields";
import { dynamoDbFields } from "./fields/dynamo-db-fields";
import { lambdaFields } from "./fields/lambda-fields";
import { rdsFields } from "./fields/rds-fields";
import { sqsFields } from "./fields/sqs-fields";

/** Every type's settings. A new type adds a file and one line here. */
const FIELDS: readonly TypeFields[] = [
  apiGatewayFields,
  lambdaFields,
  rdsFields,
  sqsFields,
  dynamoDbFields,
];

/** The default descriptors of each component type's settings, keyed by type. */
export function createFieldCatalog(): FieldCatalog {
  return new Map(FIELDS.map((fields) => [fields.type, fields]));
}
