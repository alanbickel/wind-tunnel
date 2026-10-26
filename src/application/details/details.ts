import type { StepAction } from "../../domain/model/project";

/**
 * What the Details tab shows for a selection, worded here so every screen
 * that shows it says the same thing.
 */
export type Details = ComponentDetails | EdgeDetails;

/** One setting, read-only. */
export interface SettingDetails {
  readonly key: string;
  readonly label: string;
  /** The value with its unit, e.g. "90 connections" or "lognormal, median 15 ms, p99 60 ms". */
  readonly value: string;
  readonly help: string;
  /**
   * The type's default and how sure it is, e.g. "Default 16: an assumption
   * (RDS-2)."; undefined for a setting with no default, such as an edge's.
   */
  readonly defaultNote: string | undefined;
}

/** A component: what it is, its settings, and what calls it. */
export interface ComponentDetails {
  readonly kind: "component";
  readonly name: string;
  /** The type's display name, e.g. "RDS". */
  readonly typeName: string;
  readonly settings: readonly SettingDetails[];
  /** The names of the workflows with a step that calls it, in project order. */
  readonly calledBy: readonly string[];
}

/** An edge: what it joins, its settings, and the steps that call along it. */
export interface EdgeDetails {
  readonly kind: "edge";
  readonly sourceName: string;
  readonly targetName: string;
  readonly settings: readonly SettingDetails[];
  readonly calledAlongBy: readonly StepCall[];
}

/** A workflow step that calls along an edge: its workflow, and what it does. */
export interface StepCall {
  readonly workflowName: string;
  readonly action: StepAction;
}
