import {
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import { shownWorkflowId } from "./shown-workflow-id";
import styles from "./WorkflowPicker.module.css";

export interface WorkflowPickerProps {
  readonly project: Project;
  readonly selection: Selection | undefined;
  readonly onSelect: (selection: Selection) => void;
  /** "Clear selection": nothing is selected after it. */
  readonly onClear: () => void;
  /** Called as the menu opens, so the screen can close a panel it would cover. */
  readonly onOpen: () => void;
}

const ITEM_SELECTOR = '[role^="menuitem"]';

/** Where a key moves the focus among the items, given them and the focused one. */
type Mover = (items: readonly HTMLElement[], current: number) => number;

const MOVES: Readonly<Record<string, Mover>> = {
  ArrowDown: (items, current) => (current + 1) % items.length,
  ArrowUp: (items, current) => (current - 1 + items.length) % items.length,
  Home: () => 0,
  End: (items) => items.length - 1,
};

/**
 * A menu button that shows the selected workflow's name, or "Workflows"
 * with none, and opens a menu above it: a radio item for each workflow, the
 * selected one checked, and an item that clears the selection. Not a native
 * `<select>`, whose arrow keys would change its value while it's closed.
 * The arrow keys, Home, and End move through the items, Enter or Space
 * picks one, and Escape closes the menu and puts the focus back on the
 * button. Picking a workflow selects it, as its row in the list does.
 */
export function WorkflowPicker(props: WorkflowPickerProps) {
  const { project, selection } = props;
  const menu = useMenuState(props.onOpen);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const shown = shownWorkflowId(selection);
  const name = project.workflows.find(({ id }) => id === shown)?.name;
  return (
    <div className={styles.picker} onBlur={menu.closeOnLeave}>
      {menu.open && (
        <WorkflowMenu
          {...props}
          {...{ shown, menuId, buttonRef }}
          close={menu.close}
        />
      )}
      <PickerButton {...{ menu, menuId, buttonRef }}>
        {name ?? "Workflows"}
      </PickerButton>
    </div>
  );
}

interface PickerButtonProps {
  readonly menu: MenuState;
  readonly menuId: string;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly children: string;
}

/** The button that shows the shown workflow, and opens and closes the menu. */
function PickerButton({
  menu,
  menuId,
  buttonRef,
  children,
}: PickerButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.button}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      aria-controls={menu.open ? menuId : undefined}
      onClick={menu.toggle}
      onKeyDown={menu.openOnArrow}
    >
      <span className={styles.name}>{children}</span>
      <span aria-hidden="true" className={styles.arrow}>
        ▴
      </span>
    </button>
  );
}

/** Whether the menu is open, and what opens, closes, and leaves it. */
interface MenuState {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  readonly openOnArrow: (event: KeyboardEvent<HTMLElement>) => void;
  readonly closeOnLeave: (event: FocusEvent<HTMLElement>) => void;
}

function useMenuState(onOpen: () => void): MenuState {
  const [open, setOpen] = useState(false);
  const show = () => {
    onOpen();
    setOpen(true);
  };
  return {
    open,
    toggle: () => {
      if (open) setOpen(false);
      else show();
    },
    close: () => {
      setOpen(false);
    },
    openOnArrow: (event) => {
      if (open || !OPENING_KEYS.has(event.key)) return;
      event.preventDefault();
      show();
    },
    // Focus moving out of the picker (a click elsewhere, or Tab) closes it.
    closeOnLeave: (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setOpen(false);
    },
  };
}

/** The keys that open the menu from its button, besides Enter and Space. */
const OPENING_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowUp"]);

interface WorkflowMenuProps extends WorkflowPickerProps {
  readonly shown: string | undefined;
  readonly menuId: string;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly close: () => void;
}

/** The open menu: the workflows, then "Clear selection". */
function WorkflowMenu(props: WorkflowMenuProps) {
  const { menuId, buttonRef, close, onClear } = props;
  // The focus goes to the button first, so closing the inspector later
  // returns there, not to an item that's gone.
  const toButton = () => {
    buttonRef.current?.focus();
    close();
  };
  const pick = (choose: () => void) => () => {
    toButton();
    choose();
  };
  return (
    <ul
      ref={focusFirstItem}
      id={menuId}
      role="menu"
      aria-label="Workflows"
      className={styles.menu}
      onKeyDown={(event) => {
        moveOrClose(event, toButton);
      }}
    >
      <WorkflowItems {...props} pick={pick} />
      <li role="none" className={styles.clear}>
        <MenuItem role="menuitem" onClick={pick(onClear)}>
          Clear selection
        </MenuItem>
      </li>
    </ul>
  );
}

interface WorkflowItemsProps extends WorkflowMenuProps {
  /** Wraps what a pick does with putting the focus back on the button. */
  readonly pick: (choose: () => void) => () => void;
}

/** A radio item for each workflow, the shown one checked. */
function WorkflowItems({ project, shown, onSelect, pick }: WorkflowItemsProps) {
  const { checkWorkflows } = useUseCases();
  const checks = useMemo(
    () => checkWorkflows.execute({ project }),
    [checkWorkflows, project],
  );
  return project.workflows.map(({ id, name }) => (
    <li key={id} role="none">
      <MenuItem
        role="menuitemradio"
        checked={id === shown}
        problems={checks.get(id)?.problems}
        onClick={pick(() => {
          onSelect({ kind: "workflow", workflowId: id });
        })}
      >
        {name}
      </MenuItem>
    </li>
  ));
}

interface MenuItemProps {
  readonly role: "menuitem" | "menuitemradio";
  /** For a radio item: whether it's the selected one. */
  readonly checked?: boolean;
  /** "1 problem", "2 problems"; undefined for none. */
  readonly problems?: string | undefined;
  readonly onClick: () => void;
  readonly children: string;
}

/**
 * One item. A radio item's check mark is a character, not just a color, and
 * a workflow's problem count follows its name in words, as in the list.
 */
function MenuItem(props: MenuItemProps) {
  const { role, checked, problems, onClick, children } = props;
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitemradio" ? checked === true : undefined}
      tabIndex={-1}
      className={styles.item}
      onClick={onClick}
    >
      <span aria-hidden="true" className={styles.check}>
        {checked === true ? "✓" : ""}
      </span>
      {children}
      {problems !== undefined && (
        <>
          {" · "}
          <span className={styles.problems}>{problems}</span>
        </>
      )}
    </button>
  );
}

/** The menu's ref: as it mounts, focuses the checked item, or the first. */
function focusFirstItem(menu: HTMLElement | null): void {
  const checked = menu?.querySelector<HTMLElement>('[aria-checked="true"]');
  const first = menu?.querySelector<HTMLElement>(ITEM_SELECTOR);
  (checked ?? first)?.focus();
}

/**
 * Escape closes the menu, and the other keys move the focus among the items.
 * Tab closes it too: the focus goes to the button and the key's default is
 * left alone, so the browser moves on from the button, not onto it.
 */
function moveOrClose(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Tab") {
    close();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  const move = MOVES[event.key];
  if (move === undefined) return;
  event.preventDefault();
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
  ];
  const current = items.findIndex((item) => item === document.activeElement);
  items[move(items, current)]?.focus();
}
