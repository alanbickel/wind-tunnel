/**
 * Orders strings by UTF-16 code unit, the same in every locale, unlike
 * `localeCompare`. For `Array.prototype.sort`; swap the arguments for
 * descending order.
 */
export function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
