import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { SimulationRunner } from "../ports/simulation-runner";
import { RunSimulation } from "../use-cases/run-simulation";

/**
 * `RunSimulation` on `runner`, checking workloads against the AWS registry
 * as the browser wires it, for tests in layers that can't build a registry.
 */
export function awsRunSimulation(runner: SimulationRunner): RunSimulation {
  return new RunSimulation({ runner, registry: createAwsComponentRegistry() });
}
