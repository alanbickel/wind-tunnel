import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { DraftCheck } from "../../application/details/number-draft";
import { checkProjectName } from "../../application/details/project-name";
import { renameProject } from "../../application/edits/project-edits";
import type { ProjectSummary } from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { ScreenHeading } from "../shared/ScreenHeading";
import { describedBy, fieldKeys } from "./fields/field-parts";
import { useDraft, type Draft } from "./fields/useDraft";
import styles from "./ProjectBar.module.css";
import type { Edit } from "./useProjectEdits";

export interface ProjectNameProps {
  readonly project: Project;
  readonly headingId: string;
  readonly onEdit: (edit: Edit) => void;
}

/**
 * The project's heading and "Rename", or the rename field while renaming.
 * Choosing Rename reads the other projects' names, then turns the heading
 * into a text field holding the name, selected; Enter or leaving saves the
 * new name through the queue, and Escape puts back the saved name (UX
 * design §2.3). The field opens once the list arrives.
 */
export function ProjectName({ project, headingId, onEdit }: ProjectNameProps) {
  const { projects, openField, closeField } = useOpenField();
  const renameRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useRenameFocus({ open: projects !== undefined, inputRef, renameRef });
  return (
    <div className={styles.titleRow}>
      <ScreenHeading id={headingId} hidden={projects !== undefined}>
        {project.name}
      </ScreenHeading>
      {projects === undefined ? (
        <Button ref={renameRef} onClick={openField}>
          Rename
        </Button>
      ) : (
        <RenameField
          project={project}
          projects={projects}
          inputRef={inputRef}
          onEdit={onEdit}
          onClose={closeField}
        />
      )}
    </div>
  );
}

/** The names to check a rename against while it's open, and how it opens and closes. */
interface OpenField {
  /** Undefined while the heading shows; the projects' names while renaming. */
  readonly projects: readonly ProjectSummary[] | undefined;
  /** Reads the projects, then opens the field. */
  readonly openField: () => void;
  readonly closeField: () => void;
}

function useOpenField(): OpenField {
  const { listProjects } = useUseCases();
  const [projects, setProjects] = useState<readonly ProjectSummary[]>();
  const openField = () => {
    void listProjects.execute().then(setProjects);
  };
  const closeField = () => {
    setProjects(undefined);
  };
  return { projects, openField, closeField };
}

interface RenameFocusInput {
  readonly open: boolean;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly renameRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Opening focuses the field, with its text selected; closing, by Enter,
 * leaving, or Escape, focuses "Rename". A layout effect, as the heading
 * takes the focus when it mounts.
 */
function useRenameFocus({ open, inputRef, renameRef }: RenameFocusInput) {
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (wasOpenRef.current) {
      renameRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, inputRef, renameRef]);
}

interface RenameFieldProps {
  readonly project: Project;
  /** The projects, for the names another project already uses. */
  readonly projects: readonly ProjectSummary[];
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onEdit: (edit: Edit) => void;
  /** Puts the heading back. */
  readonly onClose: () => void;
}

/** The field's draft and message, and what Enter, leaving, and Escape do. */
interface RenameDraft {
  readonly draft: Draft<string>;
  /** What's wrong with the draft; undefined while it passes. */
  readonly message: string | undefined;
  readonly commit: () => void;
  /** Puts the heading back without saving. */
  readonly close: () => void;
}

/**
 * The draft, checked on each render: one that fails stays in the field with
 * its message and doesn't save.
 */
function useRenameDraft(props: RenameFieldProps): RenameDraft {
  const { project, projects, onEdit, onClose } = props;
  const draft = useDraft(project.name);
  const check = checkProjectName({
    text: draft.value,
    projects,
    projectId: project.id,
  });
  // Set once the field has closed. Removing the focused input fires `blur`
  // in a browser, which would save the draft Escape meant to drop.
  const closedRef = useRef(false);
  const close = () => {
    closedRef.current = true;
    onClose();
  };
  const commit = () => {
    if (closedRef.current) return;
    commitRename({ project, check, onEdit, close });
  };
  const message = check.status === "fails" ? check.message : undefined;
  return { draft, message, commit, close };
}

/** The heading-sized input and its message. */
function RenameField(props: RenameFieldProps) {
  const { inputRef } = props;
  const messageId = useId();
  const { draft, message, commit, close } = useRenameDraft(props);
  return (
    <div className={styles.renameField}>
      <input
        ref={inputRef}
        type="text"
        className={styles.renameInput}
        value={draft.value}
        aria-label="Project name"
        aria-invalid={message !== undefined}
        aria-describedby={describedBy({ messageId, message, otherIds: [] })}
        onChange={(event) => {
          draft.set(event.target.value);
        }}
        onBlur={commit}
        // Always "changed": Escape closes the field even with nothing typed.
        onKeyDown={(event) => {
          fieldKeys({ commit, changed: true, reset: close })(event);
        }}
      />
      {message !== undefined && (
        <p id={messageId} className={styles.renameMessage}>
          {message}
        </p>
      )}
    </div>
  );
}

interface CommitRenameInput {
  readonly project: Project;
  readonly check: DraftCheck<string>;
  readonly onEdit: (edit: Edit) => void;
  readonly close: () => void;
}

/**
 * Renames the project if the draft passes, and closes the field. A draft
 * that fails stays, with its message. The same name, spaces aside, renames
 * nothing.
 */
function commitRename(input: CommitRenameInput): void {
  const { project, check, onEdit, close } = input;
  if (check.status === "fails") return;
  const name = check.value;
  onEdit({
    command: (record) => renameProject(record, { name }),
    describe: () => `Rename ${project.name} to ${name}`,
  });
  close();
}
