// Checks CONTRIBUTING rule 11: each class in src/ lives in a file named after
// it. ESLint's `max-classes-per-file` checks the "one class per file" half.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findMisnamedClassFiles, kebabCase } from "./class-files";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("fixtures/", import.meta.url));

const isSourceFile = (fileName: string) => !/\.test\.tsx?$/.test(fileName);

/**
 * Classes that break the rule today, keyed `file: Class`, each with the R2
 * task that moves it. Remove an entry when its class moves; the last test
 * fails if an entry no longer matches anything.
 */
const KNOWN_EXCEPTIONS: Record<string, string> = {
  "adapters/persistence/indexeddb-project-repository.ts: IndexedDbProjectRepository":
    "R2.15",
  "application/testing/fake-ports.ts: FixedClock": "R2.15",
  "application/testing/fake-ports.ts: SequentialIds": "R2.15",
  "application/testing/fake-ports.ts: InMemoryProjectRepository": "R2.15",
  "application/testing/fake-ports.ts: InMemoryTemplateCatalog": "R2.15",
  "application/testing/fake-ports.ts: RecordingSimulationRunner": "R2.15",
  "domain/engine/arrivals.ts: ArrivalProcess": "R2.15",
  "domain/random/random-source.ts: SeededRandom": "R2.15",
  "domain/components/check-component-contract.ts: ContractHarness": "R2.6",
  "domain/metrics/metrics-collector.ts: ComponentTally": "R2.7",
  "domain/metrics/metrics-collector.ts: WorkflowTally": "R2.7",
  "domain/metrics/metrics-collector.ts: Tally": "R2.7",
  "domain/components/aws/api-gateway.ts: ApiGatewayBehavior": "R2.8",
  "domain/components/aws/dynamodb.ts: DynamoDbBehavior": "R2.8",
  "domain/components/aws/lambda.ts: LambdaBehavior": "R2.8",
  "domain/components/aws/rds.ts: RdsBehavior": "R2.8",
  "domain/components/aws/sqs.ts: SqsBehavior": "R2.8",
  "domain/components/testing/fake-definitions.ts: WorkerPoolBehavior": "R2.8",
  "domain/components/testing/fake-definitions.ts: MessageQueueBehavior": "R2.8",
};

const misnamedInSrc = () =>
  findMisnamedClassFiles({ root: SRC, includes: isSourceFile }).map(
    ({ file, className }) => `${file}: ${className}`,
  );

describe("class files", () => {
  it("are named after their class in kebab case, everywhere in src/", () => {
    const unexpected = misnamedInSrc().filter(
      (key) => !(key in KNOWN_EXCEPTIONS),
    );
    expect(unexpected).toEqual([]);
  });

  it("have no stale known exceptions", () => {
    const misnamed = new Set(misnamedInSrc());
    const stale = Object.keys(KNOWN_EXCEPTIONS).filter(
      (key) => !misnamed.has(key),
    );
    expect(stale).toEqual([]);
  });

  // The check can fail: the fixture's class doesn't match its file name.
  it("reports a class in a file named for something else", () => {
    expect(
      findMisnamedClassFiles({ root: FIXTURES, includes: () => true }),
    ).toEqual([
      {
        file: "dependencies.ts",
        className: "Stopwatch",
        expectedName: "stopwatch",
      },
    ]);
  });

  it.each([
    ["ComponentRegistryMap", "component-registry-map"],
    ["IndexedDbProjectRepository", "indexed-db-project-repository"],
    ["HTTPServer", "http-server"],
    ["Base64Encoder", "base64-encoder"],
  ])("names the file for %s %s", (className, fileName) => {
    expect(kebabCase(className)).toBe(fileName);
  });
});
