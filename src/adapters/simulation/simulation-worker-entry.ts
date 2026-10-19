// The Web Worker's script: `main.tsx` starts it with `new Worker(new URL(…))`,
// which Vite bundles into its own file. Each Worker serves one run.
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { serveRun, type RunMessage } from "./simulation-worker-protocol";

const registry = createAwsComponentRegistry();

self.addEventListener("message", (event: MessageEvent<RunMessage>) => {
  serveRun({
    request: event.data.request,
    registry,
    post: (reply) => {
      self.postMessage(reply);
    },
  });
});
