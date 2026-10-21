import { createFindingsCatalog } from "./catalog/create-findings-catalog";
import type { FindingsCatalog } from "./catalog/type-advice";
import type { Detector } from "./detector";
import { failedRequestsDetector } from "./detectors/failed-requests";
import { lateAsyncWorkDetector } from "./detectors/late-async-work";

/**
 * The default detectors, as `createAwsComponentRegistry` lists the
 * component types. A new detector is a new file and one line here.
 */
export function createDetectors(
  catalog: FindingsCatalog = createFindingsCatalog(),
): Detector[] {
  return [failedRequestsDetector(catalog), lateAsyncWorkDetector(catalog)];
}
