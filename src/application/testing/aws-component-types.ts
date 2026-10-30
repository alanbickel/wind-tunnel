import { createAwsComponentRegistry } from "../../domain/components/aws";
import { createFieldCatalog } from "../details/create-field-catalog";
import type { IdGenerator } from "../ports/id-generator";
import { ListComponentTypes } from "../use-cases/list-component-types";
import { NewComponent } from "../use-cases/new-component";
import { NewEdge } from "../use-cases/new-edge";
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
 * `NewEdge` over the AWS registry, with ids `edge-1`, `edge-2`, …
 * unless given others.
 */
export function awsNewEdge(
  ids: IdGenerator = new SequentialIds("edge"),
): NewEdge {
  return new NewEdge({ registry: createAwsComponentRegistry(), ids });
}
