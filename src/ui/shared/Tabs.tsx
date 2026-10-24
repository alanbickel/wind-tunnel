import { useId, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

/** One tab: its button's text, and the panel it shows. */
export interface TabDefinition<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly content: ReactNode;
}

export interface TabsProps<Id extends string> {
  /** Names the tab list for screen readers. */
  readonly label: string;
  readonly tabs: readonly TabDefinition<Id>[];
  readonly selected: Id;
  readonly onSelect: (id: Id) => void;
}

/**
 * Tabs on a surface, as the WAI-ARIA tabs pattern has them: the arrow keys,
 * Home, and End move between tabs and select the one they land on, and
 * only the selected tab takes a tab stop, so one press of Tab leaves the
 * list for its panel. Every panel stays mounted, the hidden ones `hidden`,
 * so what a panel holds (a run's charts, a details pane's fields) is still
 * there when its tab is selected again. Each panel scrolls on its own and
 * takes a tab stop, so the keyboard can scroll it.
 */
export function Tabs<Id extends string>(props: TabsProps<Id>) {
  const baseId = useId();
  const ids: TabIds<Id> = {
    tab: (id) => `${baseId}-tab-${id}`,
    panel: (id) => `${baseId}-panel-${id}`,
  };
  return (
    <div className={styles.tabs}>
      <TabList {...props} ids={ids} />
      {props.tabs.map(({ id, content }) => (
        <div
          key={id}
          id={ids.panel(id)}
          role="tabpanel"
          aria-labelledby={ids.tab(id)}
          className={styles.panel}
          tabIndex={0}
          hidden={id !== props.selected}
        >
          {content}
        </div>
      ))}
    </div>
  );
}

/** The element ids that tie each tab to its panel. */
interface TabIds<Id extends string> {
  readonly tab: (id: Id) => string;
  readonly panel: (id: Id) => string;
}

interface TabListProps<Id extends string> extends TabsProps<Id> {
  readonly ids: TabIds<Id>;
}

/** The row of tabs, with the selected one the only tab stop. */
function TabList<Id extends string>(props: TabListProps<Id>) {
  const { label, tabs, selected, onSelect, ids } = props;
  return (
    <div
      role="tablist"
      aria-label={label}
      className={styles.list}
      onKeyDown={(event) => {
        moveByKey({ event, tabs, selected, onSelect });
      }}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          selected={tab.id === selected}
          onSelect={onSelect}
          ids={ids}
        />
      ))}
    </div>
  );
}

interface TabButtonProps<Id extends string> {
  readonly tab: TabDefinition<Id>;
  readonly selected: boolean;
  readonly onSelect: (id: Id) => void;
  readonly ids: TabIds<Id>;
}

/** One tab, controlling its panel. */
function TabButton<Id extends string>(props: TabButtonProps<Id>) {
  const { tab, selected, onSelect, ids } = props;
  return (
    <button
      id={ids.tab(tab.id)}
      type="button"
      role="tab"
      className={styles.tab}
      aria-selected={selected}
      aria-controls={ids.panel(tab.id)}
      tabIndex={selected ? 0 : -1}
      onClick={() => {
        onSelect(tab.id);
      }}
    >
      {tab.label}
    </button>
  );
}

/** Where a key moves to, from the tab at `index` of `count`. */
interface TabMove {
  readonly index: number;
  readonly count: number;
}

const KEY_MOVES: Readonly<Record<string, (move: TabMove) => number>> = {
  ArrowRight: ({ index, count }) => (index + 1) % count,
  ArrowLeft: ({ index, count }) => (index - 1 + count) % count,
  Home: () => 0,
  End: ({ count }) => count - 1,
};

interface MoveByKeyInput<Id extends string> {
  readonly event: KeyboardEvent<HTMLElement>;
  readonly tabs: readonly TabDefinition<Id>[];
  readonly selected: Id;
  readonly onSelect: (id: Id) => void;
}

/** Selects and focuses the tab a movement key lands on; other keys pass. */
function moveByKey<Id extends string>(input: MoveByKeyInput<Id>): void {
  const { event, tabs, selected, onSelect } = input;
  const move = KEY_MOVES[event.key];
  if (move === undefined) return;
  event.preventDefault();
  const index = move({
    index: tabs.findIndex((tab) => tab.id === selected),
    count: tabs.length,
  });
  const next = tabs[index];
  if (next === undefined) return;
  onSelect(next.id);
  event.currentTarget
    .querySelectorAll<HTMLElement>('[role="tab"]')
    [index]?.focus();
}
