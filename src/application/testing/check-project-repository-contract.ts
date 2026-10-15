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
  const repo = emptyRepository;
  const violations: string[] = [];
  const expect = (ok: boolean, rule: string) => {
    if (!ok) violations.push(rule);
  };

  expect((await repo.list()).length === 0, "a new repository lists nothing");
  expect(
    (await repo.get("no-such-project")).status === "missing",
    "get reports an unknown ID as missing",
  );

  const first = variant(
    sample,
    "contract-1",
    "First",
    "2026-01-02T00:00:00.000Z",
  );
  await repo.save(first);
  const found = await repo.get(first.project.id);
  expect(
    found.status === "found" && sameData(found.record, first),
    "get returns a saved record unchanged",
  );

  const renamed = variant(
    sample,
    "contract-1",
    "First, renamed",
    "2026-01-04T00:00:00.000Z",
  );
  await repo.save(renamed);
  const replaced = await repo.get(renamed.project.id);
  expect(
    replaced.status === "found" && sameData(replaced.record, renamed),
    "saving a record with an existing ID replaces it",
  );

  const older = variant(
    sample,
    "contract-2",
    "Older",
    "2026-01-01T00:00:00.000Z",
  );
  const newer = variant(
    sample,
    "contract-3",
    "Newer",
    "2026-01-03T00:00:00.000Z",
  );
  await repo.save(older);
  await repo.save(newer);
  const listed = await repo.list();
  expect(
    sameData(listed, [renamed, newer, older].map(summaryOf)),
    "list returns one summary per project, most recently updated first",
  );

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

  let deleteFailed = false;
  try {
    await repo.delete("no-such-project");
  } catch {
    deleteFailed = true;
  }
  expect(!deleteFailed, "deleting an unknown ID does nothing");

  return violations;
}

function variant(
  sample: ProjectRecord,
  id: string,
  name: string,
  updatedAt: string,
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
