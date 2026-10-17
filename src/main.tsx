// Composition root: the only module allowed to import from every layer.
// It creates the adapters, wires them to the application's ports, and starts
// the UI inside the provider tree (every React context provider lives here).
// See docs/architecture/application-layer.md.
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserStoragePersistence } from "./adapters/persistence/browser-storage-persistence";
import { IndexedDbProjectRepository } from "./adapters/persistence/indexed-db-project-repository";
import {
  openProjectDatabase,
  type ProjectDatabase,
} from "./adapters/persistence/project-database";
import { InProcessSimulationRunner } from "./adapters/simulation/in-process-simulation-runner";
import { RandomUuidIds } from "./adapters/system/random-uuid-ids";
import { SystemClock } from "./adapters/system/system-clock";
import { createBundledTemplateCatalog } from "./adapters/templates/bundled-template-catalog";
import { CreateProjectFromTemplate } from "./application/use-cases/create-project-from-template";
import { DeleteProject } from "./application/use-cases/delete-project";
import { ListProjects } from "./application/use-cases/list-projects";
import { ListTemplates } from "./application/use-cases/list-templates";
import { OpenProject } from "./application/use-cases/open-project";
import { RunSimulation } from "./application/use-cases/run-simulation";
import { SaveProject } from "./application/use-cases/save-project";
import { createAwsComponentRegistry } from "./domain/components/aws";
import { App } from "./ui/App";
import type { UseCases } from "./ui/app/use-cases";
import { UseCasesProvider } from "./ui/app/UseCasesProvider";
import { StartupFailure } from "./ui/StartupFailure";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element in index.html");
}
const root = createRoot(rootElement);

function render(element: ReactNode): void {
  root.render(<StrictMode>{element}</StrictMode>);
}

/** Builds every adapter and the use cases over them. */
function createUseCases(database: ProjectDatabase): UseCases {
  const registry = createAwsComponentRegistry();
  const projects = new IndexedDbProjectRepository({ database, registry });
  const templates = createBundledTemplateCatalog(registry);
  const clock = new SystemClock();
  const ids = new RandomUuidIds();
  // In-process until the Web Worker runner lands (#6); it blocks the UI.
  const runner = new InProcessSimulationRunner({ registry });
  return {
    listProjects: new ListProjects({ projects }),
    listTemplates: new ListTemplates({ templates }),
    createProjectFromTemplate: new CreateProjectFromTemplate({
      templates,
      projects,
      clock,
      ids,
    }),
    openProject: new OpenProject({ projects }),
    saveProject: new SaveProject({ projects, clock, registry }),
    deleteProject: new DeleteProject({ projects }),
    runSimulation: new RunSimulation({ runner }),
    storagePersistence: new BrowserStoragePersistence({
      storage: navigator.storage,
    }),
  };
}

openProjectDatabase().then(
  (database) => {
    render(
      <UseCasesProvider useCases={createUseCases(database)}>
        <App />
      </UseCasesProvider>,
    );
  },
  (error: unknown) => {
    console.error(error);
    render(<StartupFailure error={error} />);
  },
);
