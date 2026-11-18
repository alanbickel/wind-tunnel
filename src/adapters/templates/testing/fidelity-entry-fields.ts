// Every fidelity entry tracks its gap in four fields after its heading
// (#285): Status, Kind, Depends on, and Checked. fidelity.md's "How to read
// an entry" says what each one means; this checks that each is there and
// well formed.

/** A fidelity entry: its ID and its text, heading included. */
export interface FidelityEntry {
  readonly id: string;
  readonly text: string;
}

/** Whether a field's value is well formed. */
type FieldRule = (value: string) => boolean;

/** Whether a `YYYY-MM-DD` value names a day that exists. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Each field an entry must have, and what makes its value well formed. */
const FIELD_RULES: Readonly<Record<string, FieldRule>> = {
  Status: (value) => value === "Open" || /^Accepted: \S/.test(value),
  Kind: (value) => value === "Setting" || value === "Behavior",
  "Depends on": (value) => value !== "",
  Checked: isRealDate,
};

/** A page's entries, each running from its `#### ID:` heading to the next heading. */
export function entriesOf(page: string): FidelityEntry[] {
  return page.split(/^(?=#+ )/m).flatMap((text) => {
    const id = /^#### ([A-Z]+-\d+):/.exec(text)?.[1];
    return id === undefined ? [] : [{ id, text }];
  });
}

/** A field's value in an entry, from its `- **Name:** value` line. */
function fieldValue(entry: FidelityEntry, name: string): string | undefined {
  const line = entry.text
    .split("\n")
    .find((l) => l.startsWith(`- **${name}:**`));
  return line?.slice(`- **${name}:**`.length).trim();
}

/** What's missing or malformed in an entry's fields, one line each; empty when none. */
export function entryFieldProblems(entry: FidelityEntry): string[] {
  return Object.entries(FIELD_RULES).flatMap(([name, isWellFormed]) => {
    const value = fieldValue(entry, name);
    if (value === undefined) return [`${entry.id}: no ${name}`];
    return isWellFormed(value) ? [] : [`${entry.id}: ${name} "${value}"`];
  });
}
