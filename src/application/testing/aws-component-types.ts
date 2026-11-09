import { createAwsComponentRegistry } from "../../domain/components/aws";
import { createFieldCatalog } from "../details/create-field-catalog";
import type { IdGenerator } from "../ports/id-generator";
import { ListComponentTypes } from "../use-cases/list-component-types";
import { NewComponent } from "../use-cases/new-component";
import { NewCall } from "../use-cases/new-call";
import { NewEdge } from "../use-cases/new-edge";
import { NewWorkflow } from "../use-cases/new-workflow";
import { SequentialIds } from "./sequential-ids";

/**
 * `ListComponentTypes` over the AWS registry and the default descriptors,
 * as the browser wires it, for tests in layers that can't build a registry.
 */
export function awsListComponentTypes(): ListComponentTypes {
  return new ListComponentTypes({
    registry: createAwsComponentRegistry(),
    fields: createFieldCatalog(),
  });
}

/**
 * `NewComponent` over the AWS registry, with ids `new-1`, `new-2`, …
 * unless given others.
 */
export function awsNewComponent(
  ids: IdGenerator = new SequentialIds("new"),
): NewComponent {
  return new NewComponent({ registry: createAwsComponentRegistry(), ids });
}

/**
 * `NewCall` over the AWS registry, with ids `call-1`, `call-2`, … (a
 * call's, then its edge's) unless given others.
 */
export function awsNewCall(
  ids: IdGenerator = new SequentialIds("call"),
): NewCall {
  return new NewCall({ registry: createAwsComponentRegistry(), ids });
}

/**
 * `NewEdge` over the AWS registry, with ids `edge-1`, `edge-2`, …
 * unless given others.
 */
export function awsNewEdge(
  ids: IdGenerator = new SequentialIds("edge"),
): NewEdge {
  return new NewEdge({ registry: createAwsComponentRegistry(), ids });
}

/**
 * `NewWorkflow` over the AWS registry, with ids `wf-1`, `wf-2`, … (a
 * workflow's, then its first step's) unless given others.
 */
export function awsNewWorkflow(
  ids: IdGenerator = new SequentialIds("wf"),
): NewWorkflow {
  return new NewWorkflow({ registry: createAwsComponentRegistry(), ids });
}
