import { describe, expect, it } from "vitest";
import {
  BrowserStoragePersistence,
  type PersistenceApi,
} from "./browser-storage-persistence";

interface FakeStorageInput {
  /** Whether persistence was granted before this page asked. */
  readonly granted?: boolean;
  /** The browser's answer to `persist()`. */
  readonly willGrant?: boolean;
}

/** A fake Storage API that records how often `persist` was called. */
class FakeStorage implements PersistenceApi {
  persistCalls = 0;
  private granted: boolean;
  private readonly willGrant: boolean;

  constructor({ granted = false, willGrant = false }: FakeStorageInput) {
    this.granted = granted;
    this.willGrant = willGrant;
  }

  persisted(): Promise<boolean> {
    return Promise.resolve(this.granted);
  }

  persist(): Promise<boolean> {
    this.persistCalls++;
    this.granted = this.willGrant;
    return Promise.resolve(this.granted);
  }
}

describe("BrowserStoragePersistence", () => {
  it("reports persisted without asking again when already granted", async () => {
    const storage = new FakeStorage({ granted: true });

    const status = await new BrowserStoragePersistence({ storage }).request();

    expect(status).toBe("persisted");
    expect(storage.persistCalls).toBe(0);
  });

  it("asks, and reports persisted when the browser grants it", async () => {
    const storage = new FakeStorage({ willGrant: true });

    const status = await new BrowserStoragePersistence({ storage }).request();

    expect(status).toBe("persisted");
    expect(storage.persistCalls).toBe(1);
  });

  it("reports best-effort when the browser declines", async () => {
    const storage = new FakeStorage({ willGrant: false });

    expect(await new BrowserStoragePersistence({ storage }).request()).toBe(
      "best-effort",
    );
  });

  it("reports unsupported without a Storage API", async () => {
    const persistence = new BrowserStoragePersistence({ storage: undefined });

    expect(await persistence.request()).toBe("unsupported");
  });
});
