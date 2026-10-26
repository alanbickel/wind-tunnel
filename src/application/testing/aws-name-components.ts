import { createAwsComponentRegistry } from "../../domain/components/aws";
import { NameComponents } from "../use-cases/name-components";

/**
 * `NameComponents` over the AWS registry, as the browser wires it, for
 * tests in layers that can't build a registry.
 */
export function awsNameComponents(): NameComponents {
  return new NameComponents({ registry: createAwsComponentRegistry() });
}
