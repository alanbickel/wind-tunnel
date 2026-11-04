import { createAwsComponentRegistry } from "../../domain/components/aws";
import { CheckWorkflows } from "../use-cases/check-workflows";

/**
 * `CheckWorkflows` over the AWS registry, as the browser wires it, for
 * tests in layers that can't build a registry.
 */
export function awsCheckWorkflows(): CheckWorkflows {
  return new CheckWorkflows({ registry: createAwsComponentRegistry() });
}
