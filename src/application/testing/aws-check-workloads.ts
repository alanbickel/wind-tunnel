import { createAwsComponentRegistry } from "../../domain/components/aws";
import { CheckWorkloads } from "../use-cases/check-workloads";

/**
 * `CheckWorkloads` over the AWS registry, as the browser wires it, for
 * tests in layers that can't build a registry.
 */
export function awsCheckWorkloads(): CheckWorkloads {
  return new CheckWorkloads({ registry: createAwsComponentRegistry() });
}
