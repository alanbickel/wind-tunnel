import { createAwsComponentRegistry } from "../../domain/components/aws";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
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

  const template = TEMPLATES[options.template];
  if (template === undefined) {
    return fail(`Unknown template ${JSON.stringify(options.template)}.`);
  }
  const registry = createAwsComponentRegistry();
  const loaded = loadProject(template, registry);
  if (!loaded.ok) {
    const issues = loaded.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    return fail(`The template is invalid:\n${issues.join("\n")}`);
  }

  let { project } = loaded;
  const workloadId = options.workload ?? project.workloads[0]?.id;
  let workload = project.workloads.find((w) => w.id === workloadId);
  if (workload === undefined) {
    return fail(`Unknown workload ${JSON.stringify(workloadId)}.`);
  }
  if (options.seed !== undefined) {
    workload = { ...workload, seed: options.seed };
    const replaced = workload;
    project = {
      ...project,
      workloads: project.workloads.map((w) =>
        w.id === replaced.id ? replaced : w,
      ),
    };
  }

  const run = simulateWithMetrics({
    project,
    workloadId: workload.id,
    registry,
  });
  return { exitCode: 0, output: formatReport(project, workload, run) };
}

interface Options {
  readonly template: string;
  readonly workload?: string;
  readonly seed?: number;
}

/** Returns the options, or an error message. */
function parseArgs(args: readonly string[]): Options | string {
  let template: string | undefined;
  let workload: string | undefined;
  let seed: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--help" || flag === "-h") return "";
    if (value === undefined || value.startsWith("--")) {
      return `${String(flag)} needs a value.`;
    }
    i++;
    switch (flag) {
      case "--template":
        template = value;
        break;
      case "--workload":
        workload = value;
        break;
      case "--seed":
        seed = Number(value);
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
          return `--seed must be a whole number from 0 to 4294967295.`;
        }
        break;
      default:
        return `Unknown option ${String(flag)}.`;
    }
  }
  if (template === undefined) return "--template is required.";
  return {
    template,
    ...(workload === undefined ? {} : { workload }),
    ...(seed === undefined ? {} : { seed }),
  };
}

function fail(message: string): CommandResult {
  return {
    exitCode: message === "" ? 0 : 1,
    output: message === "" ? USAGE : `${message}\n\n${USAGE}`,
  };
}
