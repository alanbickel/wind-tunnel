/** Exit code when something failed: a step, CI, or a check the driver makes. */
export const FAILED = 1;
/** Exit code when the run waits for the maintainer's answer to a question. */
export const NEEDS_DECISION = 2;

/** Ends the run with an exit code and a message for the maintainer. */
export class Stop extends Error {
  /** @type {number} */
  code;

  constructor(/** @type {number} */ code, /** @type {string} */ message) {
    super(message);
    this.code = code;
  }
}

/** Stops the run because something failed. */
export function fail(/** @type {string} */ message) {
  return new Stop(FAILED, message);
}
