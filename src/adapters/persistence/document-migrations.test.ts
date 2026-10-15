import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MIGRATIONS,
  migrateDocument,
  type DocumentMigration,
  type DocumentMigrations,
} from "./document-migrations";

/** A made-up history: v0 called the name `title`, and v2 added `tags`. */
const migrations: DocumentMigrations = {
  currentVersion: 2,
  fromVersion: new Map<number, DocumentMigration>([
    [0, ({ title, ...rest }) => ({ ...rest, name: title })],
    [1, (document) => ({ ...document, tags: [] })],
  ]),
};

const migrate = (input: unknown) => migrateDocument(input, migrations);

const issueFor = (input: unknown) => {
  const result = migrate(input);
  if (result.ok) throw new Error("expected the document to be refused");
  return result.issue;
};

describe("migrateDocument", () => {
  it("runs every migration from the document's version up, in order", () => {
    expect(migrate({ schemaVersion: 0, title: "Orders" })).toEqual({
      ok: true,
      document: { schemaVersion: 2, name: "Orders", tags: [] },
    });
  });

  it("starts from the document's own version", () => {
    expect(migrate({ schemaVersion: 1, name: "Orders" })).toEqual({
      ok: true,
      document: { schemaVersion: 2, name: "Orders", tags: [] },
    });
  });

  it("passes a current document through unchanged", () => {
    const current = { schemaVersion: 2, name: "Orders", tags: ["a"] };
    expect(migrate(current)).toEqual({ ok: true, document: current });
  });

  it("doesn't change the input", () => {
    const old = { schemaVersion: 0, title: "Orders" };
    migrate(old);
    expect(old).toEqual({ schemaVersion: 0, title: "Orders" });
  });

  it("refuses a newer version, naming the versions it reads", () => {
    expect(issueFor({ schemaVersion: 3 })).toEqual({
      path: ["schemaVersion"],
      message:
        "Unsupported schema version 3; this version of Wind Tunnel reads versions 0 to 2.",
    });
  });

  it("refuses a version older than its chain of migrations reaches", () => {
    expect(issueFor({ schemaVersion: -1 }).message).toMatch(
      /Unsupported schema version -1/,
    );
  });

  it.each([["1"], [1.5], [null]])(
    "refuses a schemaVersion of %j, which isn't a version number",
    (schemaVersion) => {
      expect(issueFor({ schemaVersion }).message).toMatch(
        /Unsupported schema version/,
      );
    },
  );

  it.each([["hello"], [null], [[1]], [{ name: "Orders" }]])(
    "refuses %j, which isn't a versioned document",
    (input) => {
      expect(issueFor(input)).toEqual({
        path: ["schemaVersion"],
        message: "This isn't a Wind Tunnel project: it has no schemaVersion.",
      });
    },
  );
});

describe("DOCUMENT_MIGRATIONS", () => {
  it("reads only version 1, until version 2 exists", () => {
    expect(issueForBuiltIn({ schemaVersion: 0 }).message).toBe(
      "Unsupported schema version 0; this version of Wind Tunnel reads version 1.",
    );
  });
});

function issueForBuiltIn(input: unknown) {
  const result = migrateDocument(input, DOCUMENT_MIGRATIONS);
  if (result.ok) throw new Error("expected the document to be refused");
  return result.issue;
}
