import { describe, expect, it } from "vitest";
import feed from "./sample-feed.json";
import { chooseShowcase, liveEvents, remaining, shareLeft, validateEvent } from "./events";
import { FREE_ACCESS_OFF, type FreeAccess } from "../../lib/freeAccess";
import type { HomeFeed, PlayerGame, PlayerState } from "./slides";

const g = (o: Partial<PlayerGame> = {}): PlayerGame => ({ owned: true, installed: false, updateAvailable: false, playable: false, installable: false, ...o });
const player: PlayerState = { ahd: g({ installable: true }), cw: g({ installable: true }), mov: g({ playable: true }), gc: g({ playable: true }) };

const ev = (o: Record<string, unknown> = {}) => ({
  id: "e1",
  kind: "countdown",
  headline: "A House Divided 1.20",
  line: "Opens Sunday.",
  startsAt: "2026-11-13T00:00:00Z",
  endsAt: "2026-11-15T22:00:00Z",
  target: "2026-11-15T22:00:00Z",
  art: "bundled:ahd",
  accent: "ahd",
  ...o,
});
const slide = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  kind: "release",
  game: "cw",
  headline: "H",
  line: "L",
  art: "bundled",
  action: { type: "store", target: "/store" },
  starts: "2026-11-01T00:00:00Z",
  ends: "2027-01-01T00:00:00Z",
  priority: 1,
  ...o,
});
const f = (events: unknown[] | undefined, slides: unknown[] = [slide("s1")]): HomeFeed => ({ version: 1, slides, ...(events ? { events } : {}) });
const on = (endsAt: string | null): FreeAccess => ({ on: true, endsAt });

describe("event windows", () => {
  it("ignores events outside their window even when the feed still lists them", () => {
    const feedWith = f([ev({ id: "past", endsAt: "2026-11-10T00:00:00Z", startsAt: "2026-11-01T00:00:00Z" }), ev({ id: "future", startsAt: "2026-11-20T00:00:00Z", endsAt: "2026-11-21T00:00:00Z" }), ev({ id: "now" })]);
    expect(liveEvents(feedWith, new Date("2026-11-14T00:00:00Z"), FREE_ACCESS_OFF).map((e) => e.id)).toEqual(["now"]);
  });
  it("the window is start-inclusive and end-exclusive", () => {
    const feedWith = f([ev()]);
    expect(liveEvents(feedWith, new Date("2026-11-13T00:00:00Z"), FREE_ACCESS_OFF)).toHaveLength(1);
    expect(liveEvents(feedWith, new Date("2026-11-15T21:59:59Z"), FREE_ACCESS_OFF)).toHaveLength(1);
    expect(liveEvents(feedWith, new Date("2026-11-15T22:00:00Z"), FREE_ACCESS_OFF)).toHaveLength(0);
  });
  it("shows at most two, ignores unknown fields, and drops bad events one by one", () => {
    const feedWith = f([ev({ id: "a", extra: { x: 1 } }), { id: "bad" }, ev({ id: "b" }), ev({ id: "c" }), ev({ id: "a" })]);
    expect(liveEvents(feedWith, new Date("2026-11-14T00:00:00Z"), FREE_ACCESS_OFF).map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("validates events strictly where it matters", () => {
    expect(validateEvent(ev({ kind: "countdown", target: undefined }))).toBeNull();
    expect(validateEvent(ev({ target: "not a date" }))).toBeNull();
    expect(validateEvent(ev({ art: "https://evil.example/a.jpg" }))).toBeNull();
    expect(validateEvent(ev({ accent: "nope" }))).toBeNull();
    expect(validateEvent(ev({ kind: "popup" }))).toBeNull();
    expect(validateEvent(ev({ kind: "offer", target: undefined }))).not.toBeNull();
    expect(validateEvent(ev({ action: { type: "store", target: "https://evil.example" } }))?.action).toBeUndefined();
  });
});

describe("the free-access double check", () => {
  const free = f([ev({ id: "free", kind: "free", accent: "studio", target: undefined, startsAt: "2026-11-13T00:00:00Z", endsAt: "2026-11-16T22:00:00Z" })]);
  const T = new Date("2026-11-14T12:00:00Z");
  it("needs the live answer to be on", () => {
    expect(liveEvents(free, T, FREE_ACCESS_OFF)).toHaveLength(0);
    expect(liveEvents(free, T, on("2026-11-16T22:00:00Z"))).toHaveLength(1);
  });
  it("takes its end time from the answer, not the feed", () => {
    const early = liveEvents(free, T, on("2026-11-14T13:00:00Z"));
    expect(early[0]?.effectiveEndsAt).toBe("2026-11-14T13:00:00Z");
    expect(liveEvents(free, new Date("2026-11-14T13:00:00Z"), on("2026-11-14T13:00:00Z"))).toHaveLength(0);
    // The store extended it past the feed's date: still live, with the store's end.
    expect(liveEvents(free, new Date("2026-11-17T00:00:00Z"), on("2026-11-18T00:00:00Z"))[0]?.effectiveEndsAt).toBe("2026-11-18T00:00:00Z");
  });
  it("falls back to the feed's end when the answer has none", () => {
    expect(liveEvents(free, T, on(null))[0]?.effectiveEndsAt).toBe("2026-11-16T22:00:00Z");
    expect(liveEvents(free, new Date("2026-11-17T00:00:00Z"), on(null))).toHaveLength(0);
  });
  it("shrinks the time-left bar toward the answer's end", () => {
    const live = liveEvents(free, T, on("2026-11-16T22:00:00Z"))[0]!;
    expect(shareLeft(live, T)).toBeGreaterThan(0.3);
    expect(shareLeft(live, T)).toBeLessThan(0.7);
    expect(shareLeft(live, new Date("2026-11-16T22:00:00Z"))).toBe(0);
  });
});

describe("layout switch", () => {
  it("is the filmstrip (B) with no events, and for old feeds with no events list", () => {
    expect(chooseShowcase(f(undefined), player, new Date("2026-11-14T00:00:00Z"), FREE_ACCESS_OFF).layout).toBe("film");
    expect(chooseShowcase(f([]), player, new Date("2026-11-14T00:00:00Z"), FREE_ACCESS_OFF).layout).toBe("film");
  });
  it("goes C to B by itself when the last live event ends", () => {
    const feedWith = f([ev()]);
    expect(chooseShowcase(feedWith, player, new Date("2026-11-15T21:59:59Z"), FREE_ACCESS_OFF).layout).toBe("split");
    expect(chooseShowcase(feedWith, player, new Date("2026-11-15T22:00:00Z"), FREE_ACCESS_OFF).layout).toBe("film");
  });
  it("goes B to C by itself when an event starts", () => {
    const feedWith = f([ev({ startsAt: "2026-11-14T12:00:00Z" })]);
    expect(chooseShowcase(feedWith, player, new Date("2026-11-14T11:59:59Z"), FREE_ACCESS_OFF).layout).toBe("film");
    expect(chooseShowcase(feedWith, player, new Date("2026-11-14T12:00:00Z"), FREE_ACCESS_OFF).layout).toBe("split");
  });
  it("goes C to B when free access is switched off even though the feed still lists it", () => {
    const feedWith = f([ev({ id: "free", kind: "free", accent: "studio", target: undefined, endsAt: "2026-11-16T22:00:00Z" })]);
    const T = new Date("2026-11-14T12:00:00Z");
    expect(chooseShowcase(feedWith, player, T, on("2026-11-16T22:00:00Z")).layout).toBe("split");
    expect(chooseShowcase(feedWith, player, T, FREE_ACCESS_OFF).layout).toBe("film");
  });
  it("one live event is still C, with the story it replaces moved out of the showcase", () => {
    const feedWith = f([ev({ id: "ev" })], [slide("a", { replacedBy: "ev" }), slide("b", { priority: 2 })]);
    const split = chooseShowcase(feedWith, player, new Date("2026-11-14T00:00:00Z"), FREE_ACCESS_OFF);
    expect(split.events).toHaveLength(1);
    expect(split.slides.map((s) => s.slide.id)).toEqual(["b"]);
    const film = chooseShowcase(feedWith, player, new Date("2026-11-16T00:00:00Z"), FREE_ACCESS_OFF);
    expect(film.slides.map((s) => s.slide.id)).toEqual(["a", "b"]);
  });
});

describe("the launch feed through the weekend", () => {
  const launch = feed as unknown as HomeFeed;
  const free = on("2026-11-16T22:00:00Z");
  it("Friday: both panels, showcase of the other four", () => {
    const s = chooseShowcase(launch, player, new Date("2026-11-13T15:00:00Z"), free);
    expect(s.layout).toBe("split");
    expect(s.events.map((e) => e.id)).toEqual(["ahd-120-countdown", "free-weekend"]);
    expect(s.slides.map((x) => x.slide.id)).toEqual(["cw-2-0-rivals", "mov-2-0-elections", "gc-early-access", "studio-state-of-the-game"]);
  });
  it("Sunday after 5 PM: AHD panel is gone, one panel left, AHD is open in the showcase", () => {
    const s = chooseShowcase(launch, player, new Date("2026-11-15T22:00:01Z"), free);
    expect(s.events.map((e) => e.id)).toEqual(["free-weekend"]);
    expect(s.slides[0]?.slide.id).toBe("ahd-120-open");
  });
  it("Monday after 5 PM: no events, filmstrip", () => {
    const s = chooseShowcase(launch, player, new Date("2026-11-16T22:00:01Z"), FREE_ACCESS_OFF);
    expect(s.layout).toBe("film");
    expect(s.slides).toHaveLength(5);
  });
});

describe("countdown maths", () => {
  it("splits the time left and never goes negative", () => {
    expect(remaining("2026-11-15T22:00:00Z", new Date("2026-11-13T05:59:30Z"))).toEqual({ days: 2, hours: 16, minutes: 0, seconds: 30 });
    expect(remaining("2026-11-15T22:00:00Z", new Date("2026-11-16T00:00:00Z"))).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
