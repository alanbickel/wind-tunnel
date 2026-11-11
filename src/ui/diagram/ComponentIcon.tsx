import APIGateway from "react-aws-icons/dist/aws/logo/APIGateway";
import DynamoDB from "react-aws-icons/dist/aws/logo/DynamoDB";
import Lambda from "react-aws-icons/dist/aws/logo/Lambda";
import RDS from "react-aws-icons/dist/aws/logo/RDS";
import SQS from "react-aws-icons/dist/aws/logo/SQS";
import { iconOf, type Icon } from "./icon-of";
import styles from "./NodeCard.module.css";

/**
 * The icon for each component type, from react-aws-icons. A type with no
 * entry is drawn with no icon, so a new type needs no icon to appear.
 */
const ICONS: Readonly<Record<string, Icon>> = {
  "api-gateway": iconOf(APIGateway),
  dynamodb: iconOf(DynamoDB),
  lambda: iconOf(Lambda),
  rds: iconOf(RDS),
  sqs: iconOf(SQS),
};

interface ComponentIconProps {
  /** The component's type, e.g. `"lambda"`. */
  readonly type: string;
}

/**
 * The type's icon, hidden from screen readers: the card's type line already
 * says it in words (and the library's own SVG title would repeat it).
 */
export function ComponentIcon({ type }: ComponentIconProps) {
  const Icon = Object.hasOwn(ICONS, type) ? ICONS[type] : undefined;
  if (Icon === undefined) return null;
  return (
    <span className={styles.icon} aria-hidden="true">
      <Icon size="100%" />
    </span>
  );
}
