import type { Project } from "../../domain/model/project";

// What the application stores and loads: a domain `Project` plus the facts
// about it that aren't part of the simulation model (ADR-0008). Adapters map
// a record to and from the persisted document format; the application never
// sees that format.

/** A canvas position. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where each component sits on the canvas, keyed by component ID. */
export interface Layout {
  readonly nodes: Readonly<Record<string, Point>>;
}

/** The template a project was created from. */
export interface ProjectSource {
  readonly templateId: string;
  readonly templateVersion: number;
}

export interface ProjectRecord {
  readonly project: Project;
  /** ISO 8601, in the `Clock` port's format. */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly source?: ProjectSource;
  readonly layout: Layout;
}

/** Enough to show a project in a list without loading it. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly updatedAt: string;
}
