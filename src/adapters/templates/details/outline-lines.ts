import type { OutlineStep } from "../../../application/details/details";
import { ASYNC_WORK_HEADING } from "../../../application/details/workflow-details";

/**
 * The step's line and the lines under it, each step's calls and async work
 * indented to start under its label, as UX design §2.5 draws them. Shared
 * by the traces in the workflow editor guide's worked example.
 */
export function outlineLines(step: OutlineStep, indent: string): string[] {
  const under = `${indent}${" ".repeat(step.number.length + 2)}`;
  const asyncLines = step.async
    ? [`${under}${ASYNC_WORK_HEADING}`, ...outlineLines(step.async, under)]
    : emptySlotLines(step, under);
  return [
    `${indent}${step.number}  ${step.label}`,
    ...step.calls.flatMap((call) => outlineLines(call, under)),
    ...asyncLines,
  ];
}

/** An `enqueue` step's empty slot: the heading, what it means, and its button. */
function emptySlotLines(step: OutlineStep, under: string): string[] {
  const { asyncSlot } = step;
  if (asyncSlot === undefined) return [];
  return [
    `${under}${ASYNC_WORK_HEADING}`,
    `${under}${asyncSlot.text}`,
    `${under}[${asyncSlot.addLabel}]`,
  ];
}
