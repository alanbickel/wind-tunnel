import type { z } from "zod";
import type { ValidationIssue } from "./validation-issue";

/**
 * Converts a failed Zod parse into `ValidationIssue`s, keeping each issue's
 * path so it points at the same place in the parsed data.
 */
export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((key) =>
      typeof key === "number" ? key : String(key),
    ),
    message: issue.message,
  }));
}
