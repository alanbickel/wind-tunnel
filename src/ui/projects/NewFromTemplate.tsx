import { useCallback } from "react";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { useLoad } from "../shared/useLoad";
import { TemplateList } from "./TemplateList";
import { useCreateFromTemplate } from "./useCreateFromTemplate";

export interface NewFromTemplateProps {
  /** Called after each project is created and saved. */
  readonly onCreated: () => void;
}

/** Lists the templates and creates a project from the one the user picks. */
export function NewFromTemplate({ onCreated }: NewFromTemplateProps) {
  const { listTemplates } = useUseCases();
  const load = useCallback(() => listTemplates.execute(), [listTemplates]);
  const { loadable } = useLoad(load);
  const { create, problem } = useCreateFromTemplate(onCreated);

  return (
    <section aria-labelledby="new-project-heading">
      <h2 id="new-project-heading">New from template</h2>
      <LoadableView loadable={loadable} what="the templates">
        {(templates) => (
          <TemplateList templates={templates} onCreate={create} />
        )}
      </LoadableView>
      {problem && <p role="alert">{problem}</p>}
    </section>
  );
}
