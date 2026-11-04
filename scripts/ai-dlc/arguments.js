// The driver's command line: the issues to work, in order, and its flags.
import { FAILED, Stop } from "./stop.js";

export const USAGE =
  "Usage: node scripts/ai-dlc.js <issue>... [--merge] [--defer-manual-checks]";
const KNOWN_FLAGS = ["--merge", "--defer-manual-checks"];

/** @typedef {{ merge: boolean, deferManualChecks: boolean }} RunFlags */
/** @typedef {{ issues: number[], flags: RunFlags }} RunRequest */

/** Reads the command line, or stops with the usage line (exit code 1). */
export function parseArguments(/** @type {string[]} */ args) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const issues = args.filter((arg) => !arg.startsWith("--")).map(Number);
  const unknown = [...flags].filter((flag) => !KNOWN_FLAGS.includes(flag));
  if (
    issues.length === 0 ||
    issues.some((issue) => !Number.isInteger(issue)) ||
    unknown.length > 0
  ) {
    throw new Stop(FAILED, USAGE);
  }
  return /** @type {RunRequest} */ ({
    issues,
    flags: {
      merge: flags.has("--merge"),
      deferManualChecks: flags.has("--defer-manual-checks"),
    },
  });
}
