/**
 * How long one unit of work takes (MVP design §3.1). `SampledServiceTime`
 * is the implementation.
 */
export interface ServiceTime {
  /** Duration of the next unit of work, in milliseconds. Never negative. */
  next(): number;
}
