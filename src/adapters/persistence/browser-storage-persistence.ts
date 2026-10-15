import type {
  PersistenceStatus,
  StoragePersistence,
} from "../../application/ports/storage-persistence";

/** The two `StorageManager` methods this adapter uses, so tests can fake them. */
export type PersistenceApi = Pick<StorageManager, "persist" | "persisted">;

export interface BrowserStoragePersistenceDependencies {
  /**
   * `navigator.storage`, or `undefined` where the browser lacks it. It's
   * missing outside secure contexts, e.g. a page served over plain HTTP.
   */
  readonly storage: PersistenceApi | undefined;
}

/** `StoragePersistence` over the browser's Storage API. */
export class BrowserStoragePersistence implements StoragePersistence {
  private readonly storage: PersistenceApi | undefined;

  constructor({ storage }: BrowserStoragePersistenceDependencies) {
    this.storage = storage;
  }

  async request(): Promise<PersistenceStatus> {
    if (this.storage === undefined) return "unsupported";
    // Checking first avoids asking again once it's granted.
    if (await this.storage.persisted()) return "persisted";
    return (await this.storage.persist()) ? "persisted" : "best-effort";
  }
}
