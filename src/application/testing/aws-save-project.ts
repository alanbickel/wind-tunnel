import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { ProjectRepository } from "../ports/project-repository";
import { SaveProject } from "../use-cases/save-project";
import { FixedClock } from "./fixed-clock";

/**
 * `SaveProject` over the AWS registry and a fixed clock, saving to
 * `projects`, for tests in layers that can't build a registry.
 */
export function awsSaveProject(projects: ProjectRepository): SaveProject {
  return new SaveProject({
    projects,
    clock: new FixedClock("2026-10-26T12:00:00.000Z"),
    registry: createAwsComponentRegistry(),
  });
}
