/**
 * A sentence as parts, not a string. The wording lives here, in
 * `application/`, so the CLI and the run panel say the same thing; each
 * formats the parts its own way (ADR-0013, ADR-0015). The panel can turn a
 * component into a link that highlights the node, and a time into one that
 * marks the chart.
 */
export type Message = readonly MessagePart[];

export type MessagePart = TextPart | NumberPart | ComponentPart | TimePart;

export interface TextPart {
  readonly kind: "text";
  readonly text: string;
}

/** A number, shown by its unit's rule. */
export interface NumberPart {
  readonly kind: "number";
  readonly value: number;
  readonly unit: NumberUnit;
}

/**
 * - `count`: a whole number of things (fractional token counts are rounded);
 * - `share`: a fraction from 0 to 1, shown as a percentage rounded down, so
 *   100% only shows when it's all of it (ADR-0014);
 * - `ms`: a duration.
 */
export type NumberUnit = "count" | "share" | "ms";

/** A component of the project, by ID. */
export interface ComponentPart {
  readonly kind: "component";
  readonly componentId: string;
}

/** A moment in the run, from its start. */
export interface TimePart {
  readonly kind: "time";
  readonly atMs: number;
}

export function count(value: number): NumberPart {
  return { kind: "number", value, unit: "count" };
}

export function share(value: number): NumberPart {
  return { kind: "number", value, unit: "share" };
}

export function duration(valueMs: number): NumberPart {
  return { kind: "number", value: valueMs, unit: "ms" };
}

export function component(componentId: string): ComponentPart {
  return { kind: "component", componentId };
}

export function at(atMs: number): TimePart {
  return { kind: "time", atMs };
}

/** What a sentence can hold between its words: a part, words, or a phrase. */
export type MessageValue = MessagePart | string | Message;

/**
 * Builds a message from a template literal: the literal's text becomes text
 * parts, and each `${}` a part (text, for a string; its parts, for a message).
 *
 * @example say`${component("orders-db")} held ${count(90)} connections.`
 */
export function say(
  strings: TemplateStringsArray,
  ...values: readonly MessageValue[]
): Message {
  const parts = strings.flatMap((text, i) => {
    const value = values[i];
    return value === undefined
      ? [textPart(text)]
      : [textPart(text), ...partsOf(value)];
  });
  return mergeText(parts.filter((p) => p.kind !== "text" || p.text !== ""));
}

/** Joins messages into one, with `separator` between them. */
export function joinMessages(
  messages: readonly Message[],
  separator: string,
): Message {
  const parts = messages.flatMap((m, i) =>
    i === 0 ? m : [textPart(separator), ...m],
  );
  return mergeText(parts);
}

/** "A", "A and B", or "A, B, and C". */
export function listOf(items: readonly Message[]): Message {
  const last = items.at(-1);
  if (last === undefined || items.length <= 2) {
    return joinMessages(items, " and ");
  }
  return say`${joinMessages(items.slice(0, -1), ", ")}, and ${last}`;
}

/** A noun's forms for one thing and for any other count. */
export type PluralForms = readonly [one: string, many: string];

/** "1 request", "2 requests": the form for a count. */
export function plural(n: number, [one, many]: PluralForms): string {
  return Math.round(n) === 1 ? one : many;
}

function textPart(text: string): TextPart {
  return { kind: "text", text };
}

function partsOf(value: MessageValue): readonly MessagePart[] {
  if (typeof value === "string") return [textPart(value)];
  return isMessage(value) ? value : [value];
}

function isMessage(value: MessagePart | Message): value is Message {
  return Array.isArray(value);
}

/** Runs of text parts as one, so equal sentences have equal parts. */
function mergeText(parts: readonly MessagePart[]): Message {
  return parts.reduce<MessagePart[]>((merged, part) => {
    const last = merged.at(-1);
    if (last?.kind !== "text" || part.kind !== "text") return [...merged, part];
    return [...merged.slice(0, -1), textPart(last.text + part.text)];
  }, []);
}
