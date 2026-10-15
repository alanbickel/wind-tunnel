// Runs `npm run simulate -- --template template-a`. Node can't import the TypeScript
// sources directly (they use extensionless imports and JSON modules), so this
// loads them through Vite's module runner, the same pipeline as the app.
import { runnerImport } from "vite";

const started = performance.now();
const { module } = await runnerImport("/src/adapters/cli/simulate-command.ts", {
  configFile: false,
  logLevel: "error",
});
const loaded = performance.now();

/** @type {import("../src/adapters/cli/simulate-command").CommandResult} */
const result = await module.runSimulateCommand(process.argv.slice(2));
if (result.exitCode === 0) {
  process.stdout.write(result.output);
  const loadSec = ((loaded - started) / 1000).toFixed(1);
  const runSec = ((performance.now() - loaded) / 1000).toFixed(1);
  process.stdout.write(`\nLoaded in ${loadSec} s, simulated in ${runSec} s.\n`);
} else {
  process.stderr.write(`${result.output}\n`);
}
process.exitCode = result.exitCode;
