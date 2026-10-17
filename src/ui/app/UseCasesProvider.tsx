import type { ReactNode } from "react";
import type { UseCases } from "./use-cases";
import { UseCasesContext } from "./use-cases-context";

export interface UseCasesProviderProps {
  readonly useCases: UseCases;
  readonly children: ReactNode;
}

/** Makes `useCases` available to every component below it via `useUseCases`. */
export function UseCasesProvider({
  useCases,
  children,
}: UseCasesProviderProps) {
  return <UseCasesContext value={useCases}>{children}</UseCasesContext>;
}
