import APIGateway from "react-aws-icons/dist/aws/logo/APIGateway";
import DynamoDB from "react-aws-icons/dist/aws/logo/DynamoDB";
import Lambda from "react-aws-icons/dist/aws/logo/Lambda";
import RDS from "react-aws-icons/dist/aws/logo/RDS";
import SQS from "react-aws-icons/dist/aws/logo/SQS";
import { iconOf, type Icon } from "./icon-of";

/**
 * The icon for each component type, from react-aws-icons, keyed by type. A
 * new type adds its entry here; the completeness test fails without one.
 */
export const COMPONENT_ICONS: Readonly<Record<string, Icon>> = {
  "api-gateway": iconOf(APIGateway),
  dynamodb: iconOf(DynamoDB),
  lambda: iconOf(Lambda),
  rds: iconOf(RDS),
  sqs: iconOf(SQS),
};
