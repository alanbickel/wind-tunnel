/** When users send requests, and which workflow each one runs. */
export interface ArrivalProcess {
  /** The first arrival after `afterMs`, or undefined if none before the workload ends. */
  next(afterMs: number): number | undefined;
  /** Picks a workflow ID at random, weighted by the mix. */
  pickWorkflow(): string;
}
