import { createEvent, fireEvent } from "@testing-library/react";

/** A point on the screen, or a distance across it, in pixels: x, then y. */
export type ScreenPoint = readonly [number, number];

/** The mouse events a drag is made of. */
export type MouseEventName = "mouseDown" | "mouseMove" | "mouseUp";

/** A mouse event, where it happens, and at which point. */
export interface MouseInput {
  readonly target: Element | Document;
  readonly type: MouseEventName;
  readonly point: ScreenPoint;
}

/**
 * Fires a mouse event at a point. d3-drag, under React Flow, reads the
 * event's `view`, which jsdom won't take in the event's init.
 */
export function mouse({ target, type, point }: MouseInput): void {
  const [clientX, clientY] = point;
  const event = createEvent[type](target, { clientX, clientY });
  Object.defineProperty(event, "view", { value: window });
  fireEvent(target, event);
}

/** A box to drag, and how far. */
export interface DragNodeInput {
  readonly box: Element;
  readonly by: ScreenPoint;
}

/** Where a drag presses, and the move past React Flow's threshold that starts it. */
const PRESS: ScreenPoint = [10, 10];
const START: ScreenPoint = [12, 10];

/**
 * Drags a React Flow box by a distance, at a zoom of 1. React Flow starts
 * a drag at the first move past its threshold, and moves the box only by
 * what follows, so this presses, makes that move, then moves `by`. After a
 * drag, d3-drag swallows the window's next click until a zero-delay
 * timeout runs.
 */
export function dragNode({ box, by: [dx, dy] }: DragNodeInput): void {
  const end: ScreenPoint = [START[0] + dx, START[1] + dy];
  mouse({ target: box, type: "mouseDown", point: PRESS });
  mouse({ target: document, type: "mouseMove", point: START });
  mouse({ target: document, type: "mouseMove", point: end });
  mouse({ target: document, type: "mouseUp", point: end });
}
