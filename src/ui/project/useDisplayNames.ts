import { useMemo } from "react";
import { useUseCases } from "../app/useUseCases";

/** A component type's name in words, from the types the Library offers. */
export function useDisplayNames(): (type: string) => string {
  const { listComponentTypes } = useUseCases();
  return useMemo(() => {
    const names = new Map(
      listComponentTypes.execute().map((t) => [t.type, t.displayName]),
    );
    return (type) => names.get(type) ?? type;
  }, [listComponentTypes]);
}
