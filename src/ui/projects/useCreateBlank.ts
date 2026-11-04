import { useCallback, useRef, useState } from "react";
import {
  checkProjectName,
  PROJECT_NAME_TAKEN,
} from "../../application/details/project-name";
import {
  summaryOf,
  type ProjectSummary,
} from "../../application/ports/project-record";
import type { CreateBlankProjectResult } from "../../application/use-cases/create-blank-project";
import type { UseCases } from "../app/use-cases";
import { useUseCases } from "../app/useUseCases";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";

export interface BlankCreation {
  /**
   * Checks the typed name and, if it passes, creates the project. Does
   * nothing while an earlier create is still running.
   */
  readonly create: (text: string) => void;
  /** What's wrong with the name, for its field; undefined if nothing is. */
  readonly message: string | undefined;
  /** Clears the name's message, as when the name changes. */
  readonly clearMessage: () => void;
  /** Why the last attempt failed, other than its name; undefined if it didn't. */
  readonly problem: string | undefined;
  /** True while a create is running. */
  readonly pending: boolean;
}

/**
 * Creates blank projects, calling `onCreated` with each one, so the screen
 * can open it. The name is checked against the projects as they are when
 * the user asks, not as the list last showed them.
 */
export function useCreateBlank(
  onCreated: (project: ProjectSummary) => void,
): BlankCreation {
  const { listProjects, createBlankProject } = useUseCases();
  const [message, setMessage] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const { pending, runAlone } = useOneAtATime();

  const create = useCallback(
    (text: string) => {
      runAlone(() => {
        setMessage(undefined);
        setProblem(undefined);
        const handlers = outcomeHandlers({ onCreated, setMessage });
        return attemptBlank(text, { listProjects, createBlankProject }).then(
          (outcome) => {
            handleStatus(handlers, outcome);
          },
          (error: unknown) => {
            setProblem(`Couldn't create the project: ${String(error)}`);
          },
        );
      });
    },
    [runAlone, listProjects, createBlankProject, onCreated],
  );
  const clearMessage = useCallback(() => {
    setMessage(undefined);
  }, []);
  return { create, message, clearMessage, problem, pending };
}

/** Runs one piece of work at a time, and says while one is running. */
interface OneAtATime {
  readonly pending: boolean;
  /** Starts the work, unless earlier work is still running. */
  readonly runAlone: (work: () => Promise<void>) => void;
}

function useOneAtATime(): OneAtATime {
  const [pending, setPending] = useState(false);
  // As in useCreateFromTemplate: state lags a render behind, so a double
  // press would see `pending` false twice; the ref changes at once.
  const running = useRef(false);
  const runAlone = useCallback((work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    void work().finally(() => {
      running.current = false;
      setPending(false);
    });
  }, []);
  return { pending, runAlone };
}

/** What became of an attempt: the use case's result, or a name refused first. */
type BlankOutcome = CreateBlankProjectResult | NameRefused;

/** The name failed its check, so nothing was asked of the use case. */
interface NameRefused {
  readonly status: "refused";
  readonly message: string;
}

type BlankUseCases = Pick<UseCases, "listProjects" | "createBlankProject">;

/** Checks the name against the saved projects, then creates the project. */
async function attemptBlank(
  text: string,
  { listProjects, createBlankProject }: BlankUseCases,
): Promise<BlankOutcome> {
  const projects = await listProjects.execute();
  const check = checkProjectName({ text, projects });
  if (check.status === "fails") {
    return { status: "refused", message: check.message };
  }
  return createBlankProject.execute(check.value);
}

interface OutcomeContext {
  readonly onCreated: (project: ProjectSummary) => void;
  readonly setMessage: (message: string) => void;
}

/** Opens the new project, or says on the field why there isn't one. */
function outcomeHandlers({
  onCreated,
  setMessage,
}: OutcomeContext): StatusHandlers<BlankOutcome, void> {
  return {
    created: ({ record }) => {
      onCreated(summaryOf(record));
    },
    "name-taken": () => {
      setMessage(PROJECT_NAME_TAKEN);
    },
    refused: ({ message }) => {
      setMessage(message);
    },
  };
}
