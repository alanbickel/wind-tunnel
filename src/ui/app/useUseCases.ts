import { use } from "react";
import type { UseCases } from "./use-cases";
import { UseCasesContext } from "./use-cases-context";

/** The use cases from the nearest `UseCasesProvider`; throws if there's none. */
export function useUseCases(): UseCases {
  const useCases = use(UseCasesContext);
  if (useCases === undefined) {
    throw new Error("useUseCases must be called inside a UseCasesProvider.");
  }
  return useCases;
}
