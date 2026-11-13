import { describe, expect, it } from "vitest";
import {
  blurLeaves,
  indexForKey,
  initialPause,
  isHeld,
  keyIntent,
  pauseReducer,
  shouldAutoAdvance,
  type PauseEvent,
} from "./pause";

function run(events: PauseEvent[], hidden = false) {
  return events.reduce(pauseReducer, initialPause(hidden));
}
const advancing = (state: ReturnType<typeof run>, count = 3) =>
  shouldAutoAdvance({ reducedMotion: false, count, ...state });

describe("carousel pause handlers", () => {
  it("advances when nothing holds it", () => {
    expect(advancing(run([]))).toBe(true);
  });

  it("holds still while the pointer is over it and resumes on leave", () => {
    const over = run([{ type: "mouseenter" }]);
    expect(over.hovered).toBe(true);
    expect(advancing(over)).toBe(false);
    expect(advancing(pauseReducer(over, { type: "mouseleave" }))).toBe(true);
  });

  it("holds still while focus is inside and resumes when it leaves", () => {
    const focused = run([{ type: "focus" }]);
    expect(advancing(focused)).toBe(false);
    expect(advancing(pauseReducer(focused, { type: "blur", stillInside: false }))).toBe(true);
  });

  it("stays paused when focus only moves between controls inside the carousel", () => {
    const state = run([{ type: "focus" }, { type: "blur", stillInside: true }]);
    expect(state.focused).toBe(true);
    expect(advancing(state)).toBe(false);
  });

  it("works out whether a blur leaves the carousel", () => {
    const inside = {};
    const container = { contains: (node: unknown) => node === inside };
    expect(blurLeaves(container, inside)).toBe(false);
    expect(blurLeaves(container, {})).toBe(true);
    expect(blurLeaves(container, null)).toBe(true);
  });

  it("stops while the window is hidden and starts again when it is shown", () => {
    const hidden = run([{ type: "visibility", hidden: true }]);
    expect(advancing(hidden)).toBe(false);
    expect(advancing(pauseReducer(hidden, { type: "visibility", hidden: false }))).toBe(true);
    expect(advancing(run([], true))).toBe(false);
  });

  it("hover and focus are independent: leaving one keeps the other holding", () => {
    const both = run([{ type: "mouseenter" }, { type: "focus" }, { type: "mouseleave" }]);
    expect(advancing(both)).toBe(false);
  });

  it("never advances with reduced motion or a single slide", () => {
    expect(shouldAutoAdvance({ reducedMotion: true, count: 3, ...run([]) })).toBe(false);
    expect(advancing(run([]), 1)).toBe(false);
  });

  it("maps arrow keys to the previous and next slide with wrap-around", () => {
    expect(indexForKey("ArrowRight", 0, 3)).toBe(1);
    expect(indexForKey("ArrowRight", 2, 3)).toBe(0);
    expect(indexForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(indexForKey("Enter", 0, 3)).toBeNull();
    expect(indexForKey("ArrowLeft", 0, 0)).toBeNull();
  });

  it("holds the animations (not only the timer) while hovered, focused or hidden", () => {
    expect(isHeld(run([]))).toBe(false);
    expect(isHeld(run([{ type: "mouseenter" }]))).toBe(true);
    expect(isHeld(run([{ type: "focus" }]))).toBe(true);
    expect(isHeld(run([], true))).toBe(true);
  });

  it("Enter runs the primary action only when the showcase itself has focus", () => {
    expect(keyIntent("Enter", 1, 3, true)).toEqual({ type: "activate" });
    expect(keyIntent("Enter", 1, 3, false)).toBeNull();
    expect(keyIntent("Enter", 0, 0, true)).toBeNull();
    expect(keyIntent("ArrowRight", 2, 3, false)).toEqual({ type: "go", index: 0 });
    expect(keyIntent("ArrowLeft", 0, 3, true)).toEqual({ type: "go", index: 2 });
    expect(keyIntent("a", 0, 3, true)).toBeNull();
  });
});
