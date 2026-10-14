import { ComponentRegistry } from "../component-registry";
import { apiGatewayDefinition } from "./api-gateway";
import { dynamoDbDefinition } from "./dynamodb";
import { lambdaDefinition } from "./lambda";
import { rdsDefinition } from "./rds";
import { sqsDefinition } from "./sqs";

export { apiGatewayDefinition } from "./api-gateway";
export { dynamoDbDefinition } from "./dynamodb";
export { lambdaDefinition } from "./lambda";
export { rdsDefinition } from "./rds";
export { sqsDefinition } from "./sqs";

/** A registry with the MVP's AWS component types (MVP design §3.2). */
export function createAwsComponentRegistry(): ComponentRegistry {
  return new ComponentRegistry()
    .register(apiGatewayDefinition)
    .register(lambdaDefinition)
    .register(dynamoDbDefinition)
    .register(rdsDefinition)
    .register(sqsDefinition);
}
