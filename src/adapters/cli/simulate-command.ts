import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { ComponentRegistry } from "../../domain/components/component-registry";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import type { Project, Workload } from "../../domain/model/project";
import { loadProject } from "../persistence/load-project";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";
import { formatReport } from "./text-report";

const TEMPLATES: Readonly<Record<string, unknown>> = {
  a: templateA,
  b: templateB,
};

export const USAGE = `Usage: npm run simulate -- --template <a|b> [--workload <id>] [--seed <n>]

  --template  Which template to run: ${Object.keys(TEMPLATES).join(", ")}
  --workload  The workload ID to run (default: the project's first workload)
  --seed      Override the workload's random seed (0 to 4294967295)`;

export interface CommandResult {
  readonly exitCode: number;
  /** For stdout on success, stderr on failure. */
  readonly output: string;
}

/**
 * The headless runner behind `npm run simulate`: loads a template, runs one
 * workload, and returns a text report. Uses no Node APIs, so tests can call
 * it directly; `scripts/simulate.js` does the printing.
 */
export function runSimulateCommand(args: readonly string[]): CommandResult {
  const options = parseArgs(args);
  if (typeof options === "string") return fail(options);

  const registry = createAwsComponentRegistry();
  const project = loadTemplate(options.template, registry);
  if (typeof project === "string") return fail(project);
  const target = selectWorkload(project, options);
  if (typeof target === "string") return fail(target);

  const run = simulateWithMetrics({
    project: target.project,
    workloadId: target.workload.id,
    registry,
  });
  return { exitCode: 0, output: formatReport({ ...target, run }) };
}

/** Returns the template's project, or an error message. */
function loadTemplate(
  name: string,
  registry: ComponentRegistry,
): Project | string {
  const template = TEMPLATES[name];
  if (template === undefined)
    return `Unknown template ${JSON.stringify(name)}.`;
  const loaded = loadProject(template, registry);
  if (loaded.ok) return loaded.record.project;
  const issues = loaded.issues.map(
    (i) => `  ${i.path.join(".")}: ${i.message}`,
  );
  return `The template is invalid:\n${issues.join("\n")}`;
}

/** The workload to run, and the project it runs in. */
interface RunTarget {
  readonly project: Project;
  readonly workload: Workload;
}

/** Returns the workload the options ask for, or an error message. */
function selectWorkload(
  project: Project,
  options: Options,
): RunTarget | string {
  const workloadId = options.workload ?? project.workloads[0]?.id;
  const workload = project.workloads.find((w) => w.id === workloadId);
  if (workload === undefined) {
    return `Unknown workload ${JSON.stringify(workloadId)}.`;
  }
  if (options.seed === undefined) return { project, workload };
  return withSeed({ project, workload }, options.seed);
}

/** The target with its workload's seed replaced, in the project too. */
function withSeed(target: RunTarget, seed: number): RunTarget {
  const workload = { ...target.workload, seed };
  const workloads = target.project.workloads.map((w) =>
    w.id === workload.id ? workload : w,
  );
  return { project: { ...target.project, workloads }, workload };
}

interface Options {
  readonly template: string;
  readonly workload?: string;
  readonly seed?: number;
}

/** What one flag adds to the options, or an error message ("" for help). */
type FlagResult = Partial<Options> | string;

type FlagParser = (value: string) => FlagResult;

const FLAGS: Readonly<Record<string, FlagParser>> = {
  "--template": (template) => ({ template }),
  "--workload": (workload) => ({ workload }),
  "--seed": parseSeed,
};

const HELP_FLAGS: ReadonlySet<string> = new Set(["--help", "-h"]);

const MAX_SEED = 0xffff_ffff;

/** Returns the options, or an error message ("" for help). */
function parseArgs(args: readonly string[]): Options | string {
  let draft: Partial<Options> = {};
  for (let i = 0; i < args.length; i += 2) {
    const parsed = parseFlag({ flag: String(args[i]), value: args[i + 1] });
    if (typeof parsed === "string") return parsed;
    draft = { ...draft, ...parsed };
  }
  if (draft.template === undefined) return "--template is required.";
  return { ...draft, template: draft.template };
}

/** A flag from the command line and the argument after it, if any. */
interface FlagWithValue {
  readonly flag: string;
  readonly value: string | undefined;
}

function parseFlag({ flag, value }: FlagWithValue): FlagResult {
  if (HELP_FLAGS.has(flag)) return "";
  if (!isFlagValue(value)) return `${flag} needs a value.`;
  // An own-property check, so "--toString" can't find an inherited method.
  const parse = Object.hasOwn(FLAGS, flag) ? FLAGS[flag] : undefined;
  if (parse === undefined) return `Unknown option ${flag}.`;
  return parse(value);
}

/** False when the flag is last, or followed by another flag instead. */
function isFlagValue(value: string | undefined): value is string {
  return value !== undefined && !value.startsWith("--");
}

function parseSeed(value: string): FlagResult {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    return `--seed must be a whole number from 0 to ${String(MAX_SEED)}.`;
  }
  return { seed };
}

function fail(message: string): CommandResult {
  return {
    exitCode: message === "" ? 0 : 1,
    output: message === "" ? USAGE : `${message}\n\n${USAGE}`,
  };
}
