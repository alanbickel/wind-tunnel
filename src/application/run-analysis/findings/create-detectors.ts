import { createFindingsCatalog } from "./catalog/create-findings-catalog";
import type { FindingsCatalog } from "./catalog/type-advice";
import type { Detector } from "./detector";
import { backlogDetector } from "./detectors/backlog";
import { bucketDrainedDetector } from "./detectors/bucket-drained";
import { failedDeliveriesDetector } from "./detectors/failed-deliveries";
import { failedRequestsDetector } from "./detectors/failed-requests";
import { lateAsyncWorkDetector } from "./detectors/late-async-work";
import { retriesAbsorbedDetector } from "./detectors/retries-absorbed";
import { waitingHoldsLimitDetector } from "./detectors/waiting-holds-limit";

/**
 * The default detectors, as `createAwsComponentRegistry` lists the
 * component types. A new detector is a new file and one line here.
 */
export function createDetectors(
  catalog: FindingsCatalog = createFindingsCatalog(),
): Detector[] {
  return [
    failedRequestsDetector(catalog),
    failedDeliveriesDetector(catalog),
    lateAsyncWorkDetector(catalog),
    waitingHoldsLimitDetector(catalog),
    bucketDrainedDetector(catalog),
    retriesAbsorbedDetector(catalog),
    backlogDetector(catalog),
  ];
}
