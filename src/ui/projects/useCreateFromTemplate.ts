import { useCallback, useRef, useState } from "react";
import type { CreateProjectResult } from "../../application/use-cases/create-project-from-template";
import { useUseCases } from "../app/useUseCases";
import { handleStatus } from "../shared/status-handlers";

export interface CreateFromTemplate {
  /** Does nothing while an earlier create is still running. */
  readonly create: (templateId: string) => void;
  /** Why the last attempt failed, for the user; undefined if it didn't. */
  readonly problem: string | undefined;
  /** True while a create is running. */
  readonly pending: boolean;
}

/** Creates projects from templates, calling `onCreated` after each one. */
export function useCreateFromTemplate(
  onCreated: () => void,
): CreateFromTemplate {
  const { createProjectFromTemplate } = useUseCases();
  const [problem, setProblem] = useState<string>();
  const [pending, setPending] = useState(false);
  // State lags a render behind, so a double-click would see `pending` false
  // twice; the ref changes at once.
  const running = useRef(false);

  const create = useCallback(
    (templateId: string) => {
      if (running.current) return;
      running.current = true;
      setPending(true);
      setProblem(undefined);
      void settleCreate({
        attempt: createProjectFromTemplate.execute(templateId),
        onCreated,
        setProblem,
      }).finally(() => {
        running.current = false;
        setPending(false);
      });
    },
    [createProjectFromTemplate, onCreated],
  );
  return { create, problem, pending };
}

interface CreateOutcomeContext {
  readonly onCreated: () => void;
  readonly setProblem: (problem: string) => void;
}

interface SettleCreateInput extends CreateOutcomeContext {
  readonly attempt: Promise<CreateProjectResult>;
}

/** Waits for a create to finish and handles its result or its failure. */
function settleCreate({
  attempt,
  ...context
}: SettleCreateInput): Promise<void> {
  return attempt.then(
    (result) => {
      handleCreateResult({ result, ...context });
    },
    (error: unknown) => {
      context.setProblem(`Couldn't create the project: ${String(error)}`);
    },
  );
}

interface HandleCreateResultInput extends CreateOutcomeContext {
  readonly result: CreateProjectResult;
}

/** Tells the screen a project was created, or shows why it wasn't. */
function handleCreateResult({
  result,
  onCreated,
  setProblem,
}: HandleCreateResultInput): void {
  handleStatus<CreateProjectResult, undefined>(
    {
      created: () => {
        onCreated();
      },
      "template-missing": () => {
        setProblem("That template no longer exists.");
      },
    },
    result,
  );
}
