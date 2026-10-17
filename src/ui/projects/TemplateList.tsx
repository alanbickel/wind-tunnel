import type { TemplateSummary } from "../../application/ports/template-catalog";

export interface TemplateListProps {
  readonly templates: readonly TemplateSummary[];
  readonly onCreate: (templateId: string) => void;
}

/** The bundled templates, each with a button that makes a project from it. */
export function TemplateList({ templates, onCreate }: TemplateListProps) {
  return (
    <ul>
      {templates.map((template) => (
        <li key={template.id}>
          <strong>{template.name}</strong>{" "}
          <button
            type="button"
            aria-label={`Create a project from ${template.name}`}
            onClick={() => {
              onCreate(template.id);
            }}
          >
            Create
          </button>
          {template.description && <p>{template.description}</p>}
        </li>
      ))}
    </ul>
  );
}
