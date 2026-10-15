import { summaryOf, type ProjectRecord } from "../ports/project-record";
import type { ProjectRepository } from "../ports/project-repository";
import { compareStrings } from "./compare-strings";

/**
 * Checks that a `ProjectRepository` behaves as the port promises: what's
 * saved comes back unchanged, saving again replaces, `list` sorts newest
 * first, and `delete` removes. Returns the broken rules; an empty list means
 * the repository passed. Every implementation should run this, so use cases
 * tested against the in-memory fake hold for the real adapter too.
 *
 * @param emptyRepository A new, empty repository.
 * @param sample A record the repository accepts. The check saves copies of it
 *   under other IDs, names, and timestamps.
 */
export async function checkProjectRepositoryContract(
  emptyRepository: ProjectRepository,
  sample: ProjectRecord,
): Promise<string[]> {
  const violations: string[] = [];
  const check: ContractCheck = {
    repo: emptyRepository,
    records: contractRecords(sample),
    expect: (ok, rule) => {
      if (!ok) violations.push(rule);
    },
  };
  // In order: each stage starts from the repository the last one left.
  for (const stage of STAGES) await stage(check);
  return violations;
}

/** Copies of the sample that the stages save, under other IDs and names. */
interface ContractRecords {
  readonly first: ProjectRecord;
  /** `first`, saved again with a new name. */
  readonly renamed: ProjectRecord;
  readonly older: ProjectRecord;
  readonly newer: ProjectRecord;
}

/** What every stage works with. */
interface ContractCheck {
  readonly repo: ProjectRepository;
  readonly records: ContractRecords;
  /** Records `rule` as broken unless `ok`. */
  readonly expect: (ok: boolean, rule: string) => void;
}

type ContractStage = (check: ContractCheck) => Promise<void>;

const STAGES: readonly ContractStage[] = [
  checkEmpty,
  checkSaveAndGet,
  checkReplace,
  checkList,
  checkDelete,
  checkDeleteUnknown,
];

async function checkEmpty({ repo, expect }: ContractCheck): Promise<void> {
  expect((await repo.list()).length === 0, "a new repository lists nothing");
  expect(
    (await repo.get("no-such-project")).status === "missing",
    "get reports an unknown ID as missing",
  );
}

async function checkSaveAndGet(check: ContractCheck): Promise<void> {
  const { first } = check.records;
  await check.repo.save(first);
  const found = await check.repo.get(first.project.id);
  check.expect(
    found.status === "found" && sameData(found.record, first),
    "get returns a saved record unchanged",
  );
}

async function checkReplace(check: ContractCheck): Promise<void> {
  const { renamed } = check.records;
  await check.repo.save(renamed);
  const replaced = await check.repo.get(renamed.project.id);
  check.expect(
    replaced.status === "found" && sameData(replaced.record, renamed),
    "saving a record with an existing ID replaces it",
  );
}

async function checkList({
  repo,
  records,
  expect,
}: ContractCheck): Promise<void> {
  const { renamed, older, newer } = records;
  await repo.save(older);
  await repo.save(newer);
  const listed = await repo.list();
  expect(
    sameData(listed, [renamed, newer, older].map(summaryOf)),
    "list returns one summary per project, most recently updated first",
  );
}

async function checkDelete({
  repo,
  records,
  expect,
}: ContractCheck): Promise<void> {
  const { renamed, older, newer } = records;
  await repo.delete(newer.project.id);
  expect(
    (await repo.get(newer.project.id)).status === "missing",
    "a deleted project is missing",
  );
  expect(
    sameData(
      (await repo.list()).map((s) => s.id),
      [renamed.project.id, older.project.id],
    ),
    "a deleted project is no longer listed, and the others are",
  );
}

async function checkDeleteUnknown({
  repo,
  expect,
}: ContractCheck): Promise<void> {
  let deleteFailed = false;
  try {
    await repo.delete("no-such-project");
  } catch {
    deleteFailed = true;
  }
  expect(!deleteFailed, "deleting an unknown ID does nothing");
}

function contractRecords(sample: ProjectRecord): ContractRecords {
  return {
    first: variant(sample, {
      id: "contract-1",
      name: "First",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }),
    renamed: variant(sample, {
      id: "contract-1",
      name: "First, renamed",
      updatedAt: "2026-01-04T00:00:00.000Z",
    }),
    older: variant(sample, {
      id: "contract-2",
      name: "Older",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    newer: variant(sample, {
      id: "contract-3",
      name: "Newer",
      updatedAt: "2026-01-03T00:00:00.000Z",
    }),
  };
}

/** The fields a copy of the sample changes. */
interface VariantFields {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

function variant(
  sample: ProjectRecord,
  { id, name, updatedAt }: VariantFields,
): ProjectRecord {
  return { ...sample, project: { ...sample.project, id, name }, updatedAt };
}

/** Equal as JSON data, ignoring key order. */
function sameData(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([x], [y]) => compareStrings(x, y)),
        )
      : v,
  );
}
