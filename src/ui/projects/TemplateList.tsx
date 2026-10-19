import type { TemplateSummary } from "../../application/ports/template-catalog";
import { Button } from "../shared/Button";
import { Card, CardList } from "../shared/CardList";
import styles from "./TemplateList.module.css";

export interface TemplateListProps {
  readonly templates: readonly TemplateSummary[];
  readonly onCreate: (templateId: string) => void;
  /** Marks the buttons unavailable while a create is running. */
  readonly pending: boolean;
}

/** The bundled templates, each with a button that makes a project from it. */
export function TemplateList({
  templates,
  onCreate,
  pending,
}: TemplateListProps) {
  return (
    <CardList>
      {templates.map((template) => (
        <Card key={template.id}>
          <div className={styles.header}>
            <h3 className={styles.name}>{template.name}</h3>
            <Button
              usable={!pending}
              label={`Create a project from ${template.name}`}
              onClick={() => {
                onCreate(template.id);
              }}
            >
              Create
            </Button>
          </div>
          {template.description && <p>{template.description}</p>}
        </Card>
      ))}
    </CardList>
  );
}
