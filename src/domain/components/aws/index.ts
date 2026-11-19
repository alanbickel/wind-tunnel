import type { ComponentRegistry } from "../component-registry";
import { ComponentRegistryMap } from "../component-registry-map";
import { apiGatewayDefinition } from "./api-gateway";
import { dynamoDbDefinition } from "./dynamodb";
import { lambdaDefinition } from "./lambda";
import { rdsDefinition } from "./rds";
import { s3Definition } from "./s3";
import { sqsDefinition } from "./sqs";

export { apiGatewayDefinition } from "./api-gateway";
export { dynamoDbDefinition } from "./dynamodb";
export { lambdaDefinition } from "./lambda";
export { rdsDefinition } from "./rds";
export { s3Definition } from "./s3";
export { sqsDefinition } from "./sqs";

/** A registry with every AWS component type: the MVP's (MVP design §3.2) and S3. */
export function createAwsComponentRegistry(): ComponentRegistry {
  return new ComponentRegistryMap()
    .register(apiGatewayDefinition)
    .register(lambdaDefinition)
    .register(dynamoDbDefinition)
    .register(rdsDefinition)
    .register(sqsDefinition)
    .register(s3Definition);
}
