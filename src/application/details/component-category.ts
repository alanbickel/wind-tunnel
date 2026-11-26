// The groups the Library sorts component types into (UX design §4, "The
// Library's categories"). The list is closed: a type picks one of these.

/** One group of the Library. */
export type ComponentCategory =
  "front-door" | "compute" | "integration" | "data" | "security-and-identity";

/** Every category in the order the Library shows them, with its heading. */
export const COMPONENT_CATEGORIES: readonly {
  readonly category: ComponentCategory;
  readonly label: string;
}[] = [
  { category: "front-door", label: "Front door" },
  { category: "compute", label: "Compute" },
  { category: "integration", label: "Integration" },
  { category: "data", label: "Data" },
  { category: "security-and-identity", label: "Security and identity" },
];
