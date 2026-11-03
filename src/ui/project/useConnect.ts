import { useCallback } from "react";
import { nameOf } from "../../application/details/name-of";
import { connectComponents } from "../../application/edits/edge-edits";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import type { EditCommand } from "./useProjectEdits";

/** Two components to connect, in the project the screen shows. */
export interface ConnectInput {
  readonly project: Project;
  /** The caller's component id. */
  readonly from: string;
  /** The callee's component id. */
  readonly to: string;
}

/**
 * Connects two components and saves: `newEdge` gives the edge an id and
 * its caller type's defaults, and `connectComponents` adds it (UX design
 * §2.1 step 5). Returns what to announce, "Connected API to Function.", or
 * undefined if the caller's type isn't known.
 */
export type Connect = (input: ConnectInput) => string | undefined;

/** `Connect`, over the screen's `edit`. */
export function useConnect(edit: (command: EditCommand) => void): Connect {
  const { newEdge } = useUseCases();
  return useCallback(
    (input: ConnectInput) => {
      const connection = newEdge.execute(input);
      if (connection === undefined) return undefined;
      edit((record) => connectComponents(record, connection));
      const { project, from, to } = input;
      return `Connected ${nameOf(project, from)} to ${nameOf(project, to)}.`;
    },
    [newEdge, edit],
  );
}
