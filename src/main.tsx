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
import { WebWorkerSimulationRunner } from "./adapters/simulation/web-worker-simulation-runner";
import { RandomUuidIds } from "./adapters/system/random-uuid-ids";
import { SystemClock } from "./adapters/system/system-clock";
import { createBundledTemplateCatalog } from "./adapters/templates/bundled-template-catalog";
import { createFieldCatalog } from "./application/details/create-field-catalog";
import { CreateProjectFromTemplate } from "./application/use-cases/create-project-from-template";
import { CheckWorkloads } from "./application/use-cases/check-workloads";
import { NameComponents } from "./application/use-cases/name-components";
import { NewComponent } from "./application/use-cases/new-component";
import { NewEdge } from "./application/use-cases/new-edge";
import { DescribeSelection } from "./application/use-cases/describe-selection";
import { DeleteProject } from "./application/use-cases/delete-project";
import { ListComponentTypes } from "./application/use-cases/list-component-types";
import { ListProjects } from "./application/use-cases/list-projects";
import { ListTemplates } from "./application/use-cases/list-templates";
import { OpenProject } from "./application/use-cases/open-project";
import { RunSimulation } from "./application/use-cases/run-simulation";
import { SaveProject } from "./application/use-cases/save-project";
import { createAwsComponentRegistry } from "./domain/components/aws";
import type { ComponentRegistry } from "./domain/components/component-registry";
import { App } from "./ui/App";
import type { UseCases } from "./ui/app/use-cases";
import { UseCasesProvider } from "./ui/app/UseCasesProvider";
import { StartupFailure } from "./ui/StartupFailure";
import { applyThemeChoice, savedThemeChoice } from "./ui/theme/theme-choice";
import "./ui/theme/tokens.css";
import "./ui/theme/base.css";

// Before the first render, so the page starts in the user's theme.
applyThemeChoice(savedThemeChoice());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element in index.html");
}
const root = createRoot(rootElement);

function render(element: ReactNode): void {
  root.render(<StrictMode>{element}</StrictMode>);
}

/** Runs each simulation in a fresh Web Worker, which Vite bundles separately. */
function createWorkerRunner(): WebWorkerSimulationRunner {
  return new WebWorkerSimulationRunner({
    createWorker: () =>
      new Worker(
        new URL(
          "./adapters/simulation/simulation-worker-entry.ts",
          import.meta.url,
        ),
        { type: "module" },
      ),
  });
}

/** Builds every adapter and the use cases over them. */
function createUseCases(database: ProjectDatabase): UseCases {
  const registry = createAwsComponentRegistry();
  const projects = new IndexedDbProjectRepository({ database, registry });
  const templates = createBundledTemplateCatalog(registry);
  const clock = new SystemClock();
  const ids = new RandomUuidIds();
  const runner = createWorkerRunner();
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
    runSimulation: new RunSimulation({ runner, registry }),
    newComponent: new NewComponent({ registry, ids }),
    newEdge: new NewEdge({ registry, ids }),
    ...createProjectReaders(registry),
    storagePersistence: new BrowserStoragePersistence({
      storage: navigator.storage,
    }),
  };
}

/** The use cases that read a project for the screen, over the component types. */
function createProjectReaders(
  registry: ComponentRegistry,
): Pick<
  UseCases,
  | "describeSelection"
  | "nameComponents"
  | "checkWorkloads"
  | "listComponentTypes"
> {
  const fields = createFieldCatalog();
  return {
    describeSelection: new DescribeSelection({ registry, fields }),
    nameComponents: new NameComponents({ registry }),
    checkWorkloads: new CheckWorkloads({ registry }),
    listComponentTypes: new ListComponentTypes({ registry, fields }),
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
