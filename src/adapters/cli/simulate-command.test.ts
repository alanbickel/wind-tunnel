import { describe, expect, it } from "vitest";
import { runSimulateCommand, USAGE } from "./simulate-command";

describe("runSimulateCommand", () => {
  it.each(["a", "b"])(
    "prints a report for template %s",
    async (template) => {
      const result = runSimulateCommand(["--template", template]);
      expect(result.exitCode).toBe(0);
      // Also the worked example in docs/architecture/headless-runner.md.
      await expect(result.output).toMatchFileSnapshot(
        `reports/template-${template}.txt`,
      );
    },
    20_000,
  );

  it("prints usage for --help", () => {
    expect(runSimulateCommand(["--help"])).toEqual({
      exitCode: 0,
      output: USAGE,
    });
  });

  it.each([
    [[], "--template is required."],
    [["--template", "z"], 'Unknown template "z".'],
    [["--template"], "--template needs a value."],
    [["--template", "a", "--seed", "-1"], "--seed must be a whole number"],
    [["--template", "a", "--seed", "1.5"], "--seed must be a whole number"],
    [["--template", "a", "--workload", "x"], 'Unknown workload "x".'],
    [["--frobnicate", "1"], "Unknown option --frobnicate."],
  ])("rejects %j", (args, message) => {
    const result = runSimulateCommand(args);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(message);
    expect(result.output).toContain(USAGE);
  });

  it("runs with the seed it's given", () => {
    const result = runSimulateCommand([
      "--template",
      "a",
      "--workload",
      "lunch-rush",
      "--seed",
      "7",
    ]);
    expect(result.output).toContain("seed 7");
  }, 20_000);
});
