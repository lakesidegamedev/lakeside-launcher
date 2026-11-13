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

/** The slide timer runs only when nothing says to hold still. Reduced motion means no timer at all. */
export function shouldAutoAdvance(o: {
  reducedMotion: boolean;
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
  count: number;
}): boolean {
  return o.count > 1 && !o.reducedMotion && !isHeld(o);
}

/** Hover, focus or a hidden window holds the slide (and its animations) where it is. */
export function isHeld(state: PauseState): boolean {
  return state.hovered || state.focused || state.hidden;
}

export type KeyIntent = { type: "go"; index: number } | { type: "activate" };

/**
 * Left and Right change slide. Enter runs the primary action, but only when the
 * showcase itself has focus: a focused button already handles its own Enter.
 */
export function keyIntent(key: string, index: number, count: number, onShowcase: boolean): KeyIntent | null {
  const next = indexForKey(key, index, count);
  if (next !== null) return { type: "go", index: next };
  if (key === "Enter" && onShowcase && count > 0) return { type: "activate" };
  return null;
}
