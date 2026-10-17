import { useCallback, useState } from "react";
import type { CreateProjectResult } from "../../application/use-cases/create-project-from-template";
import { useUseCases } from "../app/useUseCases";
import { viewFor } from "../shared/status-views";

export interface CreateFromTemplate {
  readonly create: (templateId: string) => void;
  /** Why the last attempt failed, for the user; undefined if it didn't. */
  readonly problem: string | undefined;
}

/** Creates projects from templates, calling `onCreated` after each one. */
export function useCreateFromTemplate(
  onCreated: () => void,
): CreateFromTemplate {
  const { createProjectFromTemplate } = useUseCases();
  const [problem, setProblem] = useState<string>();

  const create = useCallback(
    (templateId: string) => {
      setProblem(undefined);
      createProjectFromTemplate.execute(templateId).then(
        (result) => {
          setProblem(problemWith({ result, onCreated }));
        },
        (error: unknown) => {
          setProblem(`Couldn't create the project: ${String(error)}`);
        },
      );
    },
    [createProjectFromTemplate, onCreated],
  );
  return { create, problem };
}

interface ProblemWithInput {
  readonly result: CreateProjectResult;
  readonly onCreated: () => void;
}

function problemWith({
  result,
  onCreated,
}: ProblemWithInput): string | undefined {
  return viewFor<CreateProjectResult, string | undefined>(
    {
      created: () => {
        onCreated();
        return undefined;
      },
      "template-missing": () => "That template no longer exists.",
    },
    result,
  );
}
