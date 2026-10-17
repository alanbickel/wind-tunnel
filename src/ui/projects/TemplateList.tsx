import type { TemplateSummary } from "../../application/ports/template-catalog";

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
    <ul>
      {templates.map((template) => (
        <li key={template.id}>
          <strong>{template.name}</strong>{" "}
          <button
            type="button"
            // Not `disabled`: that would drop focus to <body> for a keyboard user
            // who just pressed it. useCreateFromTemplate ignores the click instead.
            aria-disabled={pending}
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
