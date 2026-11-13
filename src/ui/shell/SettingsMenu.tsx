import {
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "../shared/Button";
import { THEME_CHOICES, type ThemeChoice } from "../theme/theme-choice";
import { useThemeChoice } from "../theme/useThemeChoice";
import styles from "./SettingsMenu.module.css";

const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

const ITEM_SELECTOR = '[role="menuitemradio"]';

/** Three dots: the menu's icon, decorative beside its hidden name. */
function DotsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/**
 * The `⋯` button at the end of the top bar, and the menu it opens below it:
 * the theme, one radio item for each choice. The arrow keys, Home, and End
 * move through the items, Enter or Space picks one, and Escape (or Tab, or
 * leaving the menu) closes it, with the focus back on the button.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => {
    buttonRef.current?.focus();
    setOpen(false);
  };
  return (
    <div
      className={styles.settings}
      onBlur={(event) => {
        closeOnLeave(event, () => {
          setOpen(false);
        });
      }}
    >
      <SettingsButton {...{ buttonRef, menuId, open, setOpen }} />
      {open && <ThemeItems menuId={menuId} close={close} />}
    </div>
  );
}

interface SettingsButtonProps {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly menuId: string;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

/** The icon button: its name is hidden text, and a tooltip says the same. */
function SettingsButton(props: SettingsButtonProps) {
  const { buttonRef, menuId, open, setOpen } = props;
  return (
    <Button
      variant="icon"
      ref={buttonRef}
      title="Settings"
      expanded={open}
      controls={open ? menuId : undefined}
      onClick={() => {
        setOpen(!open);
      }}
    >
      <span className={styles.name}>Settings</span>
      <DotsIcon />
    </Button>
  );
}

interface ThemeItemsProps {
  readonly menuId: string;
  readonly close: () => void;
}

/** The open menu: a radio item for each theme, the chosen one checked. */
function ThemeItems({ menuId, close }: ThemeItemsProps) {
  const { choice, choose } = useThemeChoice();
  return (
    <ul
      ref={focusChecked}
      id={menuId}
      role="menu"
      aria-label="Theme"
      className={styles.menu}
      onKeyDown={(event) => {
        moveOrClose(event, close);
      }}
    >
      {THEME_CHOICES.map((option) => (
        <li key={option} role="none">
          <ThemeItem {...{ option, choice, choose, close }} />
        </li>
      ))}
    </ul>
  );
}

interface ThemeItemProps {
  readonly option: ThemeChoice;
  readonly choice: ThemeChoice;
  readonly choose: (choice: ThemeChoice) => void;
  readonly close: () => void;
}

/** One radio item; its check mark is a character, not just a color. */
function ThemeItem({ option, choice, choose, close }: ThemeItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={option === choice}
      tabIndex={-1}
      className={styles.item}
      onClick={() => {
        choose(option);
        close();
      }}
    >
      <span aria-hidden="true" className={styles.check}>
        {option === choice ? "✓" : ""}
      </span>
      {LABELS[option]}
    </button>
  );
}

/** Calls `leave` when the focus moves out of the element the event is on. */
function closeOnLeave(event: FocusEvent<HTMLElement>, leave: () => void) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  leave();
}

/** The menu's ref: as it mounts, focuses the checked item. */
function focusChecked(menu: HTMLElement | null): void {
  menu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}

/** Where a key moves the focus among the items, given their count and the focused one. */
type Mover = (count: number, current: number) => number;

const MOVES: Readonly<Record<string, Mover>> = {
  ArrowDown: (count, current) => (current + 1) % count,
  ArrowUp: (count, current) => (current - 1 + count) % count,
  Home: () => 0,
  End: (count) => count - 1,
};

/**
 * Escape and Tab close the menu (Tab's default is left alone, so the browser
 * moves on from the button); the other keys move the focus among the items.
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
  items[move(items.length, current)]?.focus();
}
