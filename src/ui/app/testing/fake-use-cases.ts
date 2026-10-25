import type { UseCases } from "../use-cases";

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`${name} wasn't expected in this test.`));

/**
 * `UseCases` whose every call rejects (or throws, for the synchronous
 * `describeSelection`), for UI tests. Override the ones a test
 * expects: `fakeUseCases({ listProjects: { execute: () => ... } })`.
 */
export function fakeUseCases(overrides: Partial<UseCases> = {}): UseCases {
  return {
    listProjects: { execute: unexpected("listProjects") },
    listTemplates: { execute: unexpected("listTemplates") },
    createProjectFromTemplate: {
      execute: unexpected("createProjectFromTemplate"),
    },
    openProject: { execute: unexpected("openProject") },
    saveProject: { execute: unexpected("saveProject") },
    deleteProject: { execute: unexpected("deleteProject") },
    runSimulation: { execute: unexpected("runSimulation") },
    describeSelection: {
      execute: () => {
        throw new Error("describeSelection wasn't expected in this test.");
      },
    },
    storagePersistence: { request: unexpected("storagePersistence") },
    ...overrides,
  };
}
