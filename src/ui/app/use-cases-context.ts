import { createContext } from "react";
import type { UseCases } from "./use-cases";

/**
 * Carries the use cases from `UseCasesProvider` to `useUseCases`. Undefined
 * outside a provider, so the hook can say what's missing.
 */
export const UseCasesContext = createContext<UseCases | undefined>(undefined);
