import type { EdgeSettings } from "../../domain/model/edge-settings";
import type { StepAction } from "../../domain/model/project";
import type { SettingFieldDescriptor } from "./field-descriptor";

/**
 * What the Details tab shows for a selection, worded here so every screen
 * that shows it says the same thing.
 */
export type Details = ComponentDetails | EdgeDetails | WorkflowDetails;

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
   * What the user can do to the step: undefined for one that can't be
   * changed, the workflow's first step, whose Remove is the workflow's, and
   * async work, which stays read-only.
   */
  readonly editing: StepEditing | undefined;
}

/** What Move up, Move down, and Remove need to know about a step that's one of a step's calls. */
export interface StepEditing {
  /** The id of the step that calls it: the selection and the focus go there after a remove. */
  readonly callerStepId: string;
  /** Undefined for a step with no siblings, which has nothing to move among. */
  readonly moves: StepMoves | undefined;
  /**
   * What Remove asks first, naming the steps under the step; undefined for a
   * step with none, which goes at once.
   */
  readonly removal: RemovalText | undefined;
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
