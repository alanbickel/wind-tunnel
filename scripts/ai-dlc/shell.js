// Runs git and gh for the driver. No shell, so arguments need no quoting.
import { spawnSync } from "node:child_process";
import { fail } from "./stop.js";

/** GitHub sometimes answers 500 or 502; #126 saw each succeed on a retry. */
const READ_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

/** @typedef {{ status: number | null, stdout: string, stderr: string }} CommandResult */

/** Runs a command and returns its result without judging the exit code. */
export function attempt(
  /** @type {string} */ command,
  /** @type {string[]} */ args,
) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error)
    throw fail(`${command} didn't start: ${result.error.message}`);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Runs a command once and returns its output, stopping the run if it fails. */
export function run(
  /** @type {string} */ command,
  /** @type {string[]} */ args,
) {
  const result = attempt(command, args);
  if (result.status !== 0) {
    throw fail(`${command} ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Runs a read-only command, retrying transient failures, and returns its output. */
export function read(
  /** @type {string} */ command,
  /** @type {string[]} */ args,
) {
  for (let attemptNumber = 1; attemptNumber < READ_ATTEMPTS; attemptNumber++) {
    const result = attempt(command, args);
    if (result.status === 0) return result.stdout;
    pause(RETRY_DELAY_MS);
  }
  return run(command, args);
}

/** Runs a command with its output in the terminal, and returns its exit code. */
export function watch(
  /** @type {string} */ command,
  /** @type {string[]} */ args,
) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error)
    throw fail(`${command} didn't start: ${result.error.message}`);
  return result.status;
}

/** Runs a read-only gh command and parses its JSON output. */
export function ghJson(/** @type {string[]} */ args) {
  return JSON.parse(read("gh", args));
}

/** Blocks for a while; the driver has nothing else to do meanwhile. */
export function pause(/** @type {number} */ durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}
