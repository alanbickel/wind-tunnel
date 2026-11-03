import { awsCheckWorkloads } from "../../../application/testing/aws-check-workloads";
import { awsListComponentTypes } from "../../../application/testing/aws-component-types";
import { awsNameComponents } from "../../../application/testing/aws-name-components";
import type { UseCases } from "../use-cases";

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`${name} wasn't expected in this test.`));

/** A synchronous use case's `execute` that throws, as `unexpected` rejects. */
const throwsUnexpected = (name: string) => (): never => {
  throw new Error(`${name} wasn't expected in this test.`);
};

/**
 * `UseCases` whose every call rejects (or throws, for the synchronous
 * `describeSelection`, `newComponent`, and `newEdge`), for UI tests. Override the ones a test
 * expects: `fakeUseCases({ listProjects: { execute: () => ... } })`.
 * `nameComponents`, `checkWorkloads`, and `listComponentTypes` are the
 * real ones over the AWS types: they're pure, and every test that shows a
 * project uses them.
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
    describeSelection: { execute: throwsUnexpected("describeSelection") },
    nameComponents: awsNameComponents(),
    checkWorkloads: awsCheckWorkloads(),
    listComponentTypes: awsListComponentTypes(),
    newComponent: { execute: throwsUnexpected("newComponent") },
    newEdge: { execute: throwsUnexpected("newEdge") },
    storagePersistence: { request: unexpected("storagePersistence") },
    ...overrides,
  };
}
