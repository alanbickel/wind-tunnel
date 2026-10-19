import { useMemo } from "react";
import type { ProjectRecord } from "../../application/ports/project-record";
import { Diagram } from "../diagram/Diagram";
import { Panel } from "../shared/Panel";
import styles from "./ArchitectureView.module.css";
import { diagramOf } from "./diagram-of";

export interface ArchitectureViewProps {
  readonly record: ProjectRecord;
}

/**
 * The project's components and connections as a read-only diagram, with the
 * same facts as a list for anyone who can't see the canvas.
 */
export function ArchitectureView({ record }: ArchitectureViewProps) {
  const content = useMemo(() => diagramOf(record), [record]);
  const names = new Map(content.nodes.map((node) => [node.id, node.label]));

  return (
    <Panel heading="Architecture">
      <Diagram
        content={content}
        label={`Architecture diagram of ${record.project.name}`}
      />
      <details className={styles.text}>
        <summary>Components and connections as text</summary>
        <ul aria-label="Components">
          {content.nodes.map((node) => (
            <li key={node.id}>
              {node.label} ({node.caption})
            </li>
          ))}
        </ul>
        <ul aria-label="Connections">
          {content.edges.map((edge) => (
            <li key={edge.id}>
              {names.get(edge.source)} → {names.get(edge.target)}
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
