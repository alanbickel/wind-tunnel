import type { IdGenerator } from "../ports/id-generator";

/** Returns `id-1`, `id-2`, ... (or with another prefix). */
export class SequentialIds implements IdGenerator {
  private readonly prefix: string;
  private next = 1;

  constructor(prefix = "id") {
    this.prefix = prefix;
  }

  newId(): string {
    return `${this.prefix}-${String(this.next++)}`;
  }
}
