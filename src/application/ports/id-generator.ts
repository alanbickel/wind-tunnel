/** New unique IDs, e.g. for projects. The MVP adapter uses `crypto.randomUUID()`. */
export interface IdGenerator {
  newId(): string;
}
