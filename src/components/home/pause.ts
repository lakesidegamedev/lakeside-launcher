// What holds the Home carousel still. Pure so the hover, focus and visibility
// handlers can be tested without a DOM.

export interface PauseState {
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
}

export type PauseEvent =
  | { type: "mouseenter" }
  | { type: "mouseleave" }
  | { type: "focus" }
  /** `stillInside` is true when focus moved to another element inside the carousel. */
  | { type: "blur"; stillInside: boolean }
  | { type: "visibility"; hidden: boolean };

export function initialPause(hidden: boolean): PauseState {
  return { hovered: false, focused: false, hidden };
}

export function pauseReducer(state: PauseState, event: PauseEvent): PauseState {
  switch (event.type) {
    case "mouseenter":
      return { ...state, hovered: true };
    case "mouseleave":
      return { ...state, hovered: false };
    case "focus":
      return { ...state, focused: true };
    case "blur":
      return event.stillInside ? state : { ...state, focused: false };
    case "visibility":
      return { ...state, hidden: event.hidden };
  }
}

/** True when focus is leaving the carousel (the next element is outside it, or there is none). */
export function blurLeaves(container: { contains(node: unknown): boolean }, next: unknown): boolean {
  return !(next && container.contains(next));
}

/** Left and Right move one slide; anything else leaves the index alone. Returns null for other keys. */
export function indexForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "ArrowRight") return (index + 1) % count;
  return null;
}
