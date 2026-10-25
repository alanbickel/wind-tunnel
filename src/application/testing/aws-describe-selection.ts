import { createAwsComponentRegistry } from "../../domain/components/aws";
import { createFieldCatalog } from "../details/create-field-catalog";
import { DescribeSelection } from "../use-cases/describe-selection";

/**
 * `DescribeSelection` over the AWS registry and the default descriptors, as
 * the browser wires it, for tests in layers that can't build a registry.
 */
export function awsDescribeSelection(): DescribeSelection {
  return new DescribeSelection({
    registry: createAwsComponentRegistry(),
    fields: createFieldCatalog(),
  });
}
