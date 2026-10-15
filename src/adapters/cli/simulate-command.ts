import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { ComponentRegistry } from "../../domain/components/component-registry";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import type { Project, Workload } from "../../domain/model/project";
import type {
  TemplateCatalog,
  TemplateSummary,
} from "../../application/ports/template-catalog";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";
import { formatReport } from "./text-report";

/** The usage text, listing the templates the catalog has. */
export function formatUsage(templates: readonly TemplateSummary[]): string {
  const ids = templates.map((t) => `                ${t.id}  ${t.name}`);
  return `Usage: npm run simulate -- --template <id> [--workload <id>] [--seed <n>]

  --template  Which template to run:
${ids.join("\n")}
  --workload  The workload ID to run (default: the project's first workload)
  --seed      Override the workload's random seed (0 to 4294967295)`;
}

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
export async function runSimulateCommand(
  args: readonly string[],
): Promise<CommandResult> {
  const registry = createAwsComponentRegistry();
  const catalog = createBundledTemplateCatalog(registry);
  const usage = formatUsage(await catalog.list());
  const report = await reportFor({ args, catalog, registry });
  if (typeof report === "string") return fail({ message: report, usage });
  return { exitCode: 0, output: report.text };
}

interface ReportInput {
  readonly args: readonly string[];
  readonly catalog: TemplateCatalog;
  readonly registry: ComponentRegistry;
}

/** The finished report. */
interface Report {
  readonly text: string;
}

/** Returns the report the arguments ask for, or an error message. */
async function reportFor({
  args,
  catalog,
  registry,
}: ReportInput): Promise<Report | string> {
  const options = parseArgs(args);
  if (typeof options === "string") return options;
  const template = await catalog.get(options.template);
  if (template === undefined) {
    return `Unknown template ${JSON.stringify(options.template)}.`;
  }
  const target = selectWorkload(template.project, options);
  if (typeof target === "string") return target;

  const run = simulateWithMetrics({
    project: target.project,
    workloadId: target.workload.id,
    registry,
  });
  return { text: formatReport({ ...target, run }) };
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

/** An error message ("" for help) and the usage text to follow it. */
interface FailureInput {
  readonly message: string;
  readonly usage: string;
}

function fail({ message, usage }: FailureInput): CommandResult {
  if (message === "") return { exitCode: 0, output: usage };
  return { exitCode: 1, output: `${message}\n\n${usage}` };
}
