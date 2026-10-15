import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { createBundledTemplateCatalog } from "../templates/bundled-template-catalog";
import { formatUsage, runSimulateCommand } from "./simulate-command";

const catalog = createBundledTemplateCatalog(createAwsComponentRegistry());
const USAGE = formatUsage(await catalog.list());

describe("runSimulateCommand", () => {
  it.each(["template-a", "template-b"])(
    "prints a report for %s",
    async (template) => {
      const result = await runSimulateCommand(["--template", template]);
      expect(result.exitCode).toBe(0);
      // Also the worked example in docs/architecture/headless-runner.md.
      await expect(result.output).toMatchFileSnapshot(
        `reports/${template}.txt`,
      );
    },
    20_000,
  );

  it("prints usage, listing the catalog's templates, for --help", async () => {
    expect(await runSimulateCommand(["--help"])).toEqual({
      exitCode: 0,
      output: USAGE,
    });
    expect(USAGE).toContain("template-a  Serverless API with RDS");
  });

  it.each([
    [[], "--template is required."],
    [["--template", "z"], 'Unknown template "z".'],
    [["--template"], "--template needs a value."],
    [
      ["--template", "template-a", "--seed", "-1"],
      "--seed must be a whole number",
    ],
    [
      ["--template", "template-a", "--seed", "1.5"],
      "--seed must be a whole number",
    ],
    [["--template", "template-a", "--workload", "x"], 'Unknown workload "x".'],
    [["--frobnicate", "1"], "Unknown option --frobnicate."],
  ])("rejects %j", async (args, message) => {
    const result = await runSimulateCommand(args);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(message);
    expect(result.output).toContain(USAGE);
  });

  it("runs with the seed it's given", async () => {
    const result = await runSimulateCommand([
      "--template",
      "template-a",
      "--workload",
      "lunch-rush",
      "--seed",
      "7",
    ]);
    expect(result.output).toContain("seed 7");
  }, 20_000);
});
