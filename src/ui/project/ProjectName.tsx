import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { checkProjectName } from "../../application/details/project-name";
import { renameProject } from "../../application/edits/project-edits";
import type { ProjectSummary } from "../../application/ports/project-record";
import type { Project } from "../../domain/model/project";
import type { UseCases } from "../app/use-cases";
import { useUseCases } from "../app/useUseCases";
import { Button } from "../shared/Button";
import { ScreenHeading } from "../shared/ScreenHeading";
import styles from "./ProjectBar.module.css";
import type { Edit } from "./useProjectEdits";

export interface ProjectNameProps {
  readonly project: Project;
  readonly headingId: string;
  readonly onEdit: (edit: Edit) => void;
}

/**
 * The project's heading and "Rename", or the rename field while renaming.
 * Choosing Rename turns the heading into a text field holding the name,
 * selected; Enter or leaving saves the new name through the queue, and
 * Escape puts back the saved name (UX design §2.3).
 */
export function ProjectName({ project, headingId, onEdit }: ProjectNameProps) {
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldFocusRenameRef = useRef(false);
  const actions = useRenameActions({ project, onEdit, shouldFocusRenameRef });

  useRenameFocus({
    renaming: actions.renaming,
    inputRef,
    renameButtonRef,
    shouldFocusRenameRef,
  });

  return (
    <ProjectNameLayout
      project={project}
      headingId={headingId}
      actions={actions}
      inputRef={inputRef}
      renameButtonRef={renameButtonRef}
    />
  );
}

interface ProjectNameLayoutProps {
  readonly project: Project;
  readonly headingId: string;
  readonly actions: RenameActions;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly renameButtonRef: RefObject<HTMLButtonElement | null>;
}

function ProjectNameLayout(props: ProjectNameLayoutProps) {
  const { project, headingId, actions, inputRef, renameButtonRef } = props;
  const messageId = useId();
  return (
    <div className={styles.titleRow}>
      <ScreenHeading id={headingId} hidden={actions.renaming}>
        {project.name}
      </ScreenHeading>
      {actions.renaming ? (
        <RenameField
          draft={actions.draft}
          message={actions.message}
          messageId={messageId}
          inputRef={inputRef}
          onChange={actions.onChange}
          onCommit={actions.commit}
          onCancel={actions.cancel}
        />
      ) : (
        <Button ref={renameButtonRef} onClick={actions.startRename}>
          Rename
        </Button>
      )}
    </div>
  );
}

interface RenameDraftState {
  readonly draft: string;
  readonly message: string | undefined;
  readonly setDraft: (text: string) => void;
  readonly setMessage: (message: string | undefined) => void;
  readonly onChange: (text: string) => void;
}

function useRenameDraft(initial: string): RenameDraftState {
  const [draft, setDraft] = useState(initial);
  const [message, setMessage] = useState<string>();
  const onChange = useCallback((text: string) => {
    setDraft(text);
    setMessage(undefined);
  }, []);
  return { draft, setDraft, message, setMessage, onChange };
}

interface RenameActionsInput {
  readonly project: Project;
  readonly onEdit: (edit: Edit) => void;
  readonly shouldFocusRenameRef: RefObject<boolean>;
}

interface RenameActions {
  readonly renaming: boolean;
  readonly draft: string;
  readonly message: string | undefined;
  readonly onChange: (text: string) => void;
  readonly startRename: () => void;
  readonly cancel: () => void;
  readonly commit: () => void;
}

function useRenameActions(input: RenameActionsInput): RenameActions {
  const { project, onEdit, shouldFocusRenameRef } = input;
  const draftState = useRenameDraft(project.name);
  const toggle = useRenameToggle({ project, draftState, shouldFocusRenameRef });

  const commit = useCommitRename({
    draft: draftState.draft,
    project,
    projectsRef: toggle.projectsRef,
    listProjects: toggle.listProjects,
    onEdit,
    onSuccess: toggle.close,
    onError: draftState.setMessage,
  });

  return { ...toggle, ...draftState, commit };
}

interface RenameToggleInput {
  readonly project: Project;
  readonly draftState: RenameDraftState;
  readonly shouldFocusRenameRef: RefObject<boolean>;
}

function useRenameToggle(input: RenameToggleInput) {
  const { project, draftState, shouldFocusRenameRef } = input;
  const [renaming, setRenaming] = useState(false);
  const projectsRef = useRef<Promise<readonly ProjectSummary[]> | null>(null);
  const { listProjects } = useUseCases();

  const startRename = useCallback(() => {
    projectsRef.current = listProjects.execute();
    draftState.setDraft(project.name);
    draftState.setMessage(undefined);
    shouldFocusRenameRef.current = true;
    setRenaming(true);
  }, [listProjects, project.name, draftState, shouldFocusRenameRef]);

  const cancel = useCallback(() => {
    draftState.setDraft(project.name);
    draftState.setMessage(undefined);
    setRenaming(false);
  }, [project.name, draftState]);

  const close = useCallback(() => {
    draftState.setMessage(undefined);
    setRenaming(false);
  }, [draftState]);

  return { renaming, startRename, cancel, close, projectsRef, listProjects };
}

interface RenameFocusInput {
  readonly renaming: boolean;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly renameButtonRef: RefObject<HTMLButtonElement | null>;
  readonly shouldFocusRenameRef: RefObject<boolean>;
}

function useRenameFocus({
  renaming,
  inputRef,
  renameButtonRef,
  shouldFocusRenameRef,
}: RenameFocusInput): void {
  useLayoutEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    if (!shouldFocusRenameRef.current) return;
    renameButtonRef.current?.focus();
    shouldFocusRenameRef.current = false;
  }, [renaming, inputRef, renameButtonRef, shouldFocusRenameRef]);
}

interface RenameFieldProps {
  readonly draft: string;
  readonly message: string | undefined;
  readonly messageId: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onChange: (text: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

function RenameField(props: RenameFieldProps) {
  const { message, messageId } = props;
  return (
    <div className={styles.renameField}>
      <RenameInput {...props} />
      {message !== undefined && (
        <p id={messageId} role="alert" className={styles.renameMessage}>
          {message}
        </p>
      )}
    </div>
  );
}

function RenameInput(props: RenameFieldProps) {
  const { draft, message, messageId, inputRef, onChange, onCommit, onCancel } =
    props;
  return (
    <input
      ref={inputRef}
      type="text"
      className={styles.renameInput}
      value={draft}
      aria-label="Project name"
      aria-invalid={message !== undefined}
      aria-describedby={message === undefined ? undefined : messageId}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={renameKeys({ onCommit, onCancel })}
    />
  );
}

interface RenameKeysInput {
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}

function renameKeys({
  onCommit,
  onCancel,
}: RenameKeysInput): (event: KeyboardEvent<HTMLInputElement>) => void {
  return (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
}

interface CommitRenameProps {
  readonly draft: string;
  readonly project: Project;
  readonly projectsRef: RefObject<Promise<readonly ProjectSummary[]> | null>;
  readonly listProjects: UseCases["listProjects"];
  readonly onEdit: (edit: Edit) => void;
  readonly onSuccess: () => void;
  readonly onError: (message: string) => void;
}

function useCommitRename({
  draft,
  project,
  projectsRef,
  listProjects,
  onEdit,
  onSuccess,
  onError,
}: CommitRenameProps): () => void {
  const committingRef = useRef(false);
  return useCallback(() => {
    if (committingRef.current) return;
    committingRef.current = true;
    void executeCommit({
      draft,
      project,
      projectsPromise: projectsRef.current,
      listProjects,
      onEdit,
      onSuccess,
      onError,
    }).finally(() => {
      committingRef.current = false;
    });
  }, [draft, project, projectsRef, listProjects, onEdit, onSuccess, onError]);
}

interface ExecuteCommitInput {
  readonly draft: string;
  readonly project: Project;
  readonly projectsPromise: Promise<readonly ProjectSummary[]> | null;
  readonly listProjects: UseCases["listProjects"];
  readonly onEdit: (edit: Edit) => void;
  readonly onSuccess: () => void;
  readonly onError: (message: string) => void;
}

async function executeCommit({
  draft,
  project,
  projectsPromise,
  listProjects,
  onEdit,
  onSuccess,
  onError,
}: ExecuteCommitInput): Promise<void> {
  const projects = await (projectsPromise ?? listProjects.execute());
  const check = checkProjectName({
    text: draft,
    projects,
    projectId: project.id,
  });
  if (check.status === "fails") {
    onError(check.message);
    return;
  }
  if (check.value !== project.name) {
    const name = check.value;
    onEdit({
      command: (record) => renameProject(record, { name }),
      describe: (after) => `Rename ${project.name} to ${after.project.name}`,
    });
  }
  onSuccess();
}
