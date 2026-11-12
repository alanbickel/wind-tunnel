import type { EdgeSettings } from "../../domain/model/edge-settings";
import type { StepAction } from "../../domain/model/project";
import type { SettingFieldDescriptor } from "./field-descriptor";

/**
 * What the Details tab shows for a selection, worded here so every screen
 * that shows it says the same thing.
 */
export type Details =
  ComponentDetails | EdgeDetails | WorkflowDetails | WorkloadDetails;

/** One setting, read-only. */
export interface SettingDetails {
  readonly key: string;
  readonly label: string;
  /** The value with its unit, e.g. "90 connections" or "lognormal, median 15 ms, p99 60 ms". */
  readonly value: string;
  readonly help: string;
  /**
   * The default and how sure it is, e.g. "Default 16: an assumption
   * (RDS-2)."; undefined for a setting with no default, such as one no
   * descriptor covers.
   */
  readonly defaultNote: string | undefined;
  /**
   * What a field needs to edit the setting; undefined for one that can't
   * be edited: a setting no descriptor covers, or an edge's whose caller
   * has no known type.
   */
  readonly editor: SettingEditor | undefined;
}

/** An editable setting: its descriptor, its value, and its default. */
export interface SettingEditor {
  readonly field: SettingFieldDescriptor;
  /** As stored, e.g. `16` or a `Distribution`. */
  readonly value: unknown;
  /**
   * The component type's default, or for an edge its caller type's;
   * undefined if the type has none for this setting.
   */
  readonly defaultValue: unknown;
}

/** A component: what it is, its settings, and what calls it. */
export interface ComponentDetails {
  readonly kind: "component";
  readonly componentId: string;
  readonly name: string;
  /** The type's display name, e.g. "RDS". */
  readonly typeName: string;
  /** The type's `defaultConfig`, for "Reset to default"; undefined for an unknown type. */
  readonly defaultConfig: unknown;
  readonly settings: readonly SettingDetails[];
  /** The names of the workflows with a step that calls it, in project order. */
  readonly calledBy: readonly string[];
  /** What Remove's confirmation says. */
  readonly removal: RemovalText;
  /**
   * The components "Connect to…" offers: every other one this component
   * has no edge to yet, in project order.
   */
  readonly connectTargets: readonly ConnectTarget[];
}

/** A component "Connect to…" offers. */
export interface ConnectTarget {
  readonly componentId: string;
  /** E.g. "orders-db (RDS)": its name, then its type's display name. */
  readonly label: string;
}

/** What removing a component or an edge would take, as its confirmation says it. */
export interface RemovalText {
  /**
   * E.g. "Remove orders-db and its edge from fn-orders?" or "Remove the
   * edge from fn-orders to orders-db?"
   */
  readonly question: string;
  /**
   * E.g. "2 workflow steps call it, and won't run until you change them.",
   * or "call along it" for an edge; undefined if no step does.
   */
  readonly warning: string | undefined;
}

/** An edge: what it joins, its settings, and the steps that call along it. */
export interface EdgeDetails {
  readonly kind: "edge";
  readonly edgeId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly settings: readonly SettingDetails[];
  readonly calledAlongBy: readonly StepCall[];
  /**
   * The caller type's `edgeDefaults`, for "Reset to default"; undefined if
   * the caller has no known type.
   */
  readonly defaults: EdgeSettings | undefined;
  /** What Remove's confirmation says. */
  readonly removal: RemovalText;
}

/**
 * A workflow, or a step in it: its name, the workloads that use it, and
 * its steps as a numbered outline (UX design §2.5 step 3). A selected step
 * shows its workflow's details, with the step named by `currentStepId`.
 */
export interface WorkflowDetails {
  readonly kind: "workflow";
  readonly workflowId: string;
  readonly name: string;
  /** The names of the workloads whose mix has it, in project order. */
  readonly usedBy: readonly string[];
  /** What Remove's confirmation says. */
  readonly removal: RemovalText;
  /** The workflow's first step, with every step under it. */
  readonly outline: OutlineStep;
  /** The selected step's id; undefined when the workflow itself is selected. */
  readonly currentStepId: string | undefined;
}

/**
 * One step of a workflow's outline, named by its component and its action;
 * its id is for selecting it, never for showing.
 */
export interface OutlineStep {
  readonly stepId: string;
  /** Its place in the outline, e.g. "1.1.1": its caller's number, then its own. */
  readonly number: string;
  /** E.g. "orders-db · read". */
  readonly label: string;
  /**
   * Its run issues, as sentences: "This step calls a component that isn't
   * in the architecture any more." Empty for a step that can run.
   */
  readonly issues: readonly string[];
  /** The steps it calls, in order. */
  readonly calls: readonly OutlineStep[];
  /**
   * An `enqueue`'s async work, numbered after its calls, as the work the
   * step leads to; undefined for a step without any.
   */
  readonly async: OutlineStep | undefined;
  /**
   * What the user can do to the step: undefined for the workflow's first
   * step, whose Remove is the workflow's. An async root has Remove but no
   * moves: it's its slot's only step.
   */
  readonly editing: StepEditing | undefined;
  /**
   * The words of the button that adds a call to the step: "Add a call from
   * api". Undefined for a step whose component is gone, which has no edges
   * to offer, and for an `enqueue`, whose follow-up work is its async work.
   */
  readonly addCallLabel: string | undefined;
  /**
   * What an `enqueue` step with no async work says and offers in its empty
   * slot; undefined for any other step, and for one that has async work.
   */
  readonly asyncSlot: AsyncSlot | undefined;
  /**
   * What an async root is, for a screen reader: "Runs when a consumer takes
   * the message from orders-queue."; undefined for any other step.
   */
  readonly description: string | undefined;
}

/** An `enqueue` step's empty async slot: what it says, and its button. */
export interface AsyncSlot {
  /** "No async work yet. A message is taken off the queue and nothing runs." */
  readonly text: string;
  /** The words of the button that opens a draft of async work. */
  readonly addLabel: string;
}

/** What Move up, Move down, and Remove need to know about a step that's one of a step's calls. */
export interface StepEditing {
  /**
   * The id of the step that calls it, or for an async root the queue that
   * holds it: the selection and the focus go there after a remove.
   */
  readonly callerStepId: string;
  /** Undefined for a step with no siblings, which has nothing to move among. */
  readonly moves: StepMoves | undefined;
  /**
   * What Remove asks first, naming the steps under the step; undefined for a
   * step with none, which goes at once.
   */
  readonly removal: RemovalText | undefined;
  /**
   * For an async root, the label of the queue step that holds it, whose
   * slot a remove leaves empty: "orders-queue · enqueue". Undefined for any
   * other step.
   */
  readonly emptiesSlotOf: string | undefined;
}

/** Which ways a step with siblings can move; at the end of its siblings, one can't. */
export interface StepMoves {
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

/** A workflow step that calls along an edge: its workflow, and what it does. */
export interface StepCall {
  readonly workflowName: string;
  readonly action: StepAction;
}

/**
 * A workload, read-only: its name, duration, and seed, its mix with each
 * entry's share, and its profile with a note on each point past the run's
 * end, each with the issues that are on it (UX design §2.7). A workload is
 * its name on screen, and a mix entry its workflow's name, never an id.
 */
export interface WorkloadDetails {
  readonly kind: "workload";
  readonly workloadId: string;
  readonly name: string;
  readonly durationSec: number;
  /** "1 second", "60 seconds". */
  readonly durationText: string;
  readonly seed: number;
  /** What Remove's confirmation says. */
  readonly removal: RemovalText;
  readonly mix: MixDetails;
  readonly profile: ProfileDetails;
}

/** A workload's mix: its rows, what they add up to, and its own issues. */
export interface MixDetails {
  /** In stored order. */
  readonly rows: readonly MixRowDetails[];
  /**
   * What an empty mix says: "No workflows in the mix. A workload with an
   * empty mix can't run."; undefined when there are rows.
   */
  readonly emptyText: string | undefined;
  /** "Shares total 100%"; undefined when there are no shares to add up. */
  readonly totalText: string | undefined;
  /** The mix's own issues, such as an empty mix, as sentences. */
  readonly issues: readonly string[];
}

/** One mix entry. */
export interface MixRowDetails {
  /** The workflow's name; for one the project no longer has, what says so. */
  readonly workflowName: string;
  /** Whether the project no longer has the workflow. */
  readonly workflowGone: boolean;
  readonly weight: number;
  /** "80.0%"; undefined when the mix has no positive weights to divide. */
  readonly shareText: string | undefined;
  /** The entry's issues, as sentences. */
  readonly issues: readonly string[];
}

/** A workload's profile: its rows, and its own issues. */
export interface ProfileDetails {
  /** In stored order. */
  readonly rows: readonly ProfileRowDetails[];
  /** The profile's own issues, such as having no points, as sentences. */
  readonly issues: readonly string[];
}

/** One profile point: a time and the rate the run aims for there. */
export interface ProfileRowDetails {
  readonly timeSec: number;
  readonly requestsPerSec: number;
  /** What a point past the run's end says; undefined for any other. */
  readonly note: string | undefined;
  /** The point's issues, as sentences. */
  readonly issues: readonly string[];
}
