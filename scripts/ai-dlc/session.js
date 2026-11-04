// One fresh headless `claude -p` session per step, streamed to the terminal
// and logged, so no transcript grows from one step to the next.
import { spawn } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fail } from "./stop.js";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium";
/**
 * Passed as `--max-turns`, and enforced by the driver too: one run went 210
 * turns past `--max-turns 150` and still ended as a success (#127).
 */
export const MAX_TURNS_PER_STEP = 150;
export const LOG_DIR = "ai-dlc-logs";
/** One line per step: its cost, turns, time, and the 5-hour usage before and after. */
const STEPS_LOG = join(LOG_DIR, "steps.jsonl");
const SHOWN_LENGTH = 200;

/** @typedef {import("./permissions.js").Permissions} Permissions */
/** @typedef {import("node:child_process").ChildProcessByStdio<null, import("node:stream").Readable, null>} SessionProcess */
/** @typedef {{ name: string, prompt: string, permissions: Permissions, systemPromptAddition: string | undefined }} SessionRequest */
/**
 * What the driver keeps from a session's events. `turnIds` holds the id of each
 * model response in the main conversation (not a subagent's): the driver's own turn count.
 * @typedef {{ result: any, fiveHourUsage: number[], turnIds: Set<string>, stoppedAtTurnLimit: boolean }} Tally
 */
/** @typedef {{ name: string, tally: Tally, logPath: string }} RecordStepInput */

/** A tally with nothing counted yet. */
export function emptyTally() {
  return /** @type {Tally} */ ({
    result: undefined,
    fiveHourUsage: [],
    turnIds: new Set(),
    stoppedAtTurnLimit: false,
  });
}

/** Runs one session to the end and stops the run if it didn't finish cleanly. */
export async function runSession(/** @type {SessionRequest} */ request) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `${timestamp()}-${request.name}.jsonl`);
  console.log(
    `\n${"-".repeat(72)}\n▶ ${request.name} (log: ${logPath})\n${"-".repeat(72)}`,
  );
  const child = spawn("claude", sessionArgs(request), {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = new Promise((resolve) => child.on("close", resolve));
  const tally = await streamOutput(child, logPath);
  const exitCode = await exited;
  recordStep({ name: request.name, tally, logPath });
  if (tally.stoppedAtTurnLimit)
    throw fail(
      `${request.name} went past ${MAX_TURNS_PER_STEP} turns, so the driver ended it. See ${logPath}.`,
    );
  if (
    exitCode !== 0 ||
    tally.result?.subtype !== "success" ||
    tally.result.is_error
  ) {
    throw fail(
      `${request.name} didn't finish (exit ${exitCode}, ${tally.result?.subtype ?? "no result"}). See ${logPath}.`,
    );
  }
}

function sessionArgs(/** @type {SessionRequest} */ request) {
  const { permissions } = request;
  return [
    request.prompt,
    "-p",
    "--model",
    MODEL,
    "--effort",
    EFFORT,
    "--max-turns",
    String(MAX_TURNS_PER_STEP),
    "--output-format",
    "stream-json",
    "--verbose",
    "--name",
    request.name,
    "--allowedTools",
    ...permissions.allowed,
    "--disallowedTools",
    ...permissions.denied,
    ...optionalFlag("--permission-mode", permissions.permissionMode),
    ...optionalFlag("--add-dir", permissions.extraDirectory),
    ...optionalFlag("--append-system-prompt", request.systemPromptAddition),
  ];
}

function optionalFlag(
  /** @type {string} */ flag,
  /** @type {string | undefined} */ value,
) {
  return value === undefined ? [] : [flag, value];
}

/**
 * Writes every event to the log and shows a short form of it in the terminal.
 * Ends the session once it goes past the turn limit, and reads on until its output closes.
 */
async function streamOutput(
  /** @type {SessionProcess} */ child,
  /** @type {string} */ logPath,
) {
  const log = createWriteStream(logPath);
  const tally = emptyTally();
  for await (const line of createInterface({ input: child.stdout })) {
    log.write(`${line}\n`);
    showEvent(parse(line), tally);
    if (tally.stoppedAtTurnLimit || !overTurnLimit(tally)) continue;
    tally.stoppedAtTurnLimit = true;
    console.log(`\n✗ Past ${MAX_TURNS_PER_STEP} turns: ending the session.`);
    child.kill();
  }
  await new Promise((resolve) => log.end(resolve));
  return tally;
}

/**
 * Counts a model response in the main conversation once, however many events
 * carry it. A subagent's responses (`parent_tool_use_id` set) don't count.
 */
export function noteTurn(/** @type {any} */ event, /** @type {Tally} */ tally) {
  const id = event.message?.id;
  if (event.parent_tool_use_id || typeof id !== "string") return;
  tally.turnIds.add(id);
}

/** True once the session has taken more turns than a step may. */
export function overTurnLimit(/** @type {Tally} */ tally) {
  return tally.turnIds.size > MAX_TURNS_PER_STEP;
}

function parse(/** @type {string} */ line) {
  try {
    return JSON.parse(line);
  } catch {
    return { type: "unparsed", line };
  }
}

const EVENT_HANDLERS = {
  system: showSessionStart,
  assistant: showAssistant,
  user: showToolErrors,
  rate_limit_event: noteUsage,
  result: showResult,
  unparsed: (/** @type {any} */ event) => console.log(event.line),
};

function showEvent(/** @type {any} */ event, /** @type {Tally} */ tally) {
  const handler =
    EVENT_HANDLERS[/** @type {keyof typeof EVENT_HANDLERS} */ (event.type)];
  handler?.(event, tally);
}

/** Shown first, so a step that's still running can be looked into: `claude --resume <id>`. */
function showSessionStart(/** @type {any} */ event) {
  if (event.subtype === "init") console.log(`  session ${event.session_id}`);
}

function showAssistant(/** @type {any} */ event, /** @type {Tally} */ tally) {
  noteTurn(event, tally);
  for (const block of event.message?.content ?? []) {
    if (block.type === "text") console.log(block.text);
    if (block.type === "tool_use")
      console.log(`  → ${block.name}: ${shorten(describeTool(block.input))}`);
  }
}

function describeTool(/** @type {any} */ input) {
  return (
    input?.command ??
    input?.file_path ??
    input?.pattern ??
    input?.description ??
    JSON.stringify(input)
  );
}

function showToolErrors(/** @type {any} */ event) {
  const content = event.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content.filter(
    (each) => each.type === "tool_result" && each.is_error,
  )) {
    const text =
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content);
    console.log(`  ✗ ${shorten(text)}`);
  }
}

function noteUsage(/** @type {any} */ event, /** @type {Tally} */ tally) {
  const utilization =
    event.rate_limit_info?.unifiedWindows?.five_hour?.utilization;
  if (typeof utilization === "number") tally.fiveHourUsage.push(utilization);
}

function showResult(/** @type {any} */ event, /** @type {Tally} */ tally) {
  tally.result = event;
  const cost = event.total_cost_usd?.toFixed(2) ?? "?";
  console.log(
    `\n■ ${event.subtype}: ${event.num_turns} turns, ${Math.round(event.duration_ms / 1000)} s, $${cost}, session ${event.session_id}`,
  );
}

function recordStep(/** @type {RecordStepInput} */ step) {
  const { result, fiveHourUsage, turnIds, stoppedAtTurnLimit } = step.tally;
  const entry = {
    at: new Date().toISOString(),
    step: step.name,
    sessionId: result?.session_id,
    outcome: stoppedAtTurnLimit ? "stopped at the turn limit" : result?.subtype,
    turns: result?.num_turns,
    driverTurns: turnIds.size,
    durationMs: result?.duration_ms,
    costUsd: result?.total_cost_usd,
    fiveHourUsageBefore: fiveHourUsage.at(0),
    fiveHourUsageAfter: fiveHourUsage.at(-1),
    log: step.logPath,
  };
  appendFileSync(STEPS_LOG, `${JSON.stringify(entry)}\n`);
}

function shorten(/** @type {string} */ text) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > SHOWN_LENGTH
    ? `${oneLine.slice(0, SHOWN_LENGTH)}…`
    : oneLine;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
