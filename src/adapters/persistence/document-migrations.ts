import type { ValidationIssue } from "../../domain/model/validation-issue";

// Brings a stored or imported document up to the schema version this build
// parses (ADR-0004). Each migration is a pure function that upgrades a
// document by exactly one version, so a document from any older version
// reaches the current one by running them in order: v1 → v2 → v3.
//
// Migrations run before any schema check, because this build keeps only the
// current schema. A migration should reshape what it knows about and leave
// everything else alone; the current schema then reports anything wrong.

/** A document as parsed JSON, before any schema has checked it. */
export type UncheckedDocument = Readonly<Record<string, unknown>>;

/**
 * Upgrades a document from one version to the next. It needn't set
 * `schemaVersion`; `migrateDocument` does that.
 */
export type DocumentMigration = (
  document: UncheckedDocument,
) => UncheckedDocument;

export interface DocumentMigrations {
  /** The version the migrations end at: the one `loadProject` parses. */
  readonly currentVersion: number;
  /** Each migration, keyed by the version it upgrades from. */
  readonly fromVersion: ReadonlyMap<number, DocumentMigration>;
}

export type MigrationResult = Migrated | MigrationRefused;

export interface Migrated {
  readonly ok: true;
  readonly document: UncheckedDocument;
}

export interface MigrationRefused {
  readonly ok: false;
  readonly issue: ValidationIssue;
}

/** The schema version this build writes, and the one migrations end at. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * This build's migrations. To change the document format, add the next
 * version's schema, add a migration here from the previous version, and
 * raise `CURRENT_SCHEMA_VERSION`.
 */
export const DOCUMENT_MIGRATIONS: DocumentMigrations = {
  currentVersion: CURRENT_SCHEMA_VERSION,
  fromVersion: new Map(),
};

/**
 * The document upgraded to `migrations.currentVersion`, or an issue if it
 * has no `schemaVersion` or one these migrations can't upgrade from.
 */
export function migrateDocument(
  input: unknown,
  migrations: DocumentMigrations,
): MigrationResult {
  if (!isDocument(input)) return refuse(NOT_A_PROJECT);
  const version = input["schemaVersion"];
  if (version === undefined) return refuse(NOT_A_PROJECT);
  if (!isReadable(version, migrations)) {
    return refuse(unsupportedVersionMessage(version, migrations));
  }
  const start = { document: input, version };
  return { ok: true, document: applyMigrations(start, migrations) };
}

const NOT_A_PROJECT =
  "This isn't a Wind Tunnel project: it has no schemaVersion.";

function isDocument(input: unknown): input is UncheckedDocument {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function refuse(message: string): MigrationRefused {
  return { ok: false, issue: { path: ["schemaVersion"], message } };
}

function isReadable(
  version: unknown,
  migrations: DocumentMigrations,
): version is number {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= oldestReadableVersion(migrations) &&
    version <= migrations.currentVersion
  );
}

/** The oldest version with an unbroken chain of migrations to the current one. */
function oldestReadableVersion(migrations: DocumentMigrations): number {
  let version = migrations.currentVersion;
  while (migrations.fromVersion.has(version - 1)) version -= 1;
  return version;
}

function unsupportedVersionMessage(
  version: unknown,
  migrations: DocumentMigrations,
): string {
  return `Unsupported schema version ${JSON.stringify(version)}; this version of Wind Tunnel reads ${readableVersions(migrations)}.`;
}

/** "version 3", or "versions 1 to 3". */
function readableVersions(migrations: DocumentMigrations): string {
  const oldest = oldestReadableVersion(migrations);
  const current = migrations.currentVersion;
  if (oldest === current) return `version ${String(current)}`;
  return `versions ${String(oldest)} to ${String(current)}`;
}

/** A document and the version it's at. */
interface VersionedDocument {
  readonly document: UncheckedDocument;
  readonly version: number;
}

function applyMigrations(
  start: VersionedDocument,
  migrations: DocumentMigrations,
): UncheckedDocument {
  let current = start;
  while (current.version < migrations.currentVersion) {
    current = migrateOnce(current, migrations);
  }
  return current.document;
}

/** One version up. `isReadable` has checked that the migration exists. */
function migrateOnce(
  { document, version }: VersionedDocument,
  migrations: DocumentMigrations,
): VersionedDocument {
  const migrate = migrations.fromVersion.get(version);
  if (migrate === undefined) {
    throw new Error(`No migration from schema version ${String(version)}`);
  }
  const next = version + 1;
  return {
    document: { ...migrate(document), schemaVersion: next },
    version: next,
  };
}
