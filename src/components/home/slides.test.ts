import { describe, expect, it } from "vitest";
import feed from "./sample-feed.json";
import {
  ADVANCE_MS,
  MAX_SLIDES,
  buildSlides,
  isAllowedArt,
  shouldAutoAdvance,
  validateSlide,
  wrapIndex,
  type HomeFeed,
  type PlayerGame,
  type PlayerState,
} from "./slides";

const NOW = new Date("2026-11-20T12:00:00Z");
const g = (o: Partial<PlayerGame> = {}): PlayerGame => ({
  owned: false,
  installed: false,
  updateAvailable: false,
  playable: false,
  installable: false,
  ...o,
});
const player: PlayerState = {
  ahd: g({ owned: true, installed: true, updateAvailable: true, playable: true, latestVersion: "1.19.0", installedVersion: "1.18.0", displayName: "A House Divided" }),
  cw: g({ installable: true }),
  gc: g({ playable: true }),
};
const art = (game: string) => `bundled/${game}.webp`;
const F = feed as unknown as HomeFeed;
const slide = (o: Record<string, unknown> = {}) => ({ ...(feed.slides[0] as object), ...o });

describe("ordering", () => {
  it("puts release, then the local update, then free, then news", () => {
    const kinds = buildSlides(F, player, NOW, art).map((s) => s.kind);
    expect(kinds).toEqual(["release", "update", "free", "news"]);
  });
  it("orders by priority inside a kind and caps at five", () => {
    const many = {
      version: 1 as const,
      slides: Array.from({ length: 8 }, (_, i) => slide({ id: `r${i}`, priority: 8 - i, action: { type: "store", target: "/store" } })),
    };
    const out = buildSlides(many, {}, NOW, art);
    expect(out).toHaveLength(MAX_SLIDES);
    expect(out.map((s) => s.id)).toEqual(["r7", "r6", "r5", "r4", "r3"]);
  });
  it("drops duplicate ids", () => {
    const dup = { version: 1 as const, slides: [slide(), slide()] };
    expect(buildSlides(dup, {}, NOW, art)).toHaveLength(1);
  });
});

describe("expiry", () => {
  it("drops slides that have ended or not started", () => {
    expect(buildSlides(F, player, new Date("2026-12-14T00:00:00Z"), art).map((s) => s.kind)).toEqual(["update"]);
    expect(buildSlides(F, player, new Date("2026-11-01T00:00:00Z"), art).filter((s) => s.kind !== "update")).toEqual([]);
  });
});

describe("nothing the player cannot act on", () => {
  it("shows no update slide for a game that is current or not installed", () => {
    const p = { ahd: g({ installed: true, updateAvailable: false, latestVersion: "1.19.0" }), cw: g({ updateAvailable: true, latestVersion: "2.0.0" }) };
    expect(buildSlides({ version: 1, slides: [] }, p, NOW, art)).toEqual([]);
  });
  it("hides a Play slide when the game is not playable", () => {
    expect(buildSlides(F, { gc: g() }, NOW, art).map((s) => s.id)).not.toContain("gc-early-access");
  });
  it("hides an Install slide for an installed or unavailable game", () => {
    const install = { version: 1 as const, slides: [slide({ action: { type: "install", target: "cw" } })] };
    expect(buildSlides(install, { cw: g({ installed: true, installable: true }) }, NOW, art)).toEqual([]);
    expect(buildSlides(install, { cw: g() }, NOW, art)).toEqual([]);
    expect(buildSlides(install, { cw: g({ installable: true }) }, NOW, art)).toHaveLength(1);
  });
  it("returns nothing for a missing feed and no updates", () => {
    expect(buildSlides(null, {}, NOW, art)).toEqual([]);
  });
  it("ignores update slides from the feed", () => {
    const bad = { version: 1 as const, slides: [slide({ id: "u", kind: "update", action: { type: "update", target: "ahd" } })] };
    expect(buildSlides(bad, player, NOW, art).map((s) => s.id)).toEqual(["update-ahd-1.19.0"]);
  });
});

describe("validation", () => {
  it("accepts the sample slides", () => {
    for (const s of feed.slides) expect(validateSlide(s)).not.toBeNull();
  });
  it.each([
    ["http art", { art: "http://lakesidegames.net/a.jpg" }],
    ["art off the allowlist", { art: "https://evil.example/a.jpg" }],
    ["look-alike art host", { art: "https://lakesidegames.net.evil.example/a.jpg" }],
    ["unknown action", { action: { type: "open", target: "/store" } }],
    ["external store target", { action: { type: "store", target: "https://evil.example" } }],
    ["protocol-relative target", { action: { type: "store", target: "//evil.example" } }],
    ["unknown game target", { action: { type: "play", target: "nope" } }],
    ["no end date", { ends: undefined }],
    ["headline too long", { headline: "x".repeat(71) }],
    ["unknown kind", { kind: "sale" }],
  ])("rejects %s", (_n, o) => {
    expect(validateSlide(slide(o))).toBeNull();
  });
  it("one bad slide does not hide the others", () => {
    const mixed = { version: 1 as const, slides: [slide({ art: "http://x" }), slide({ id: "ok" })] };
    expect(buildSlides(mixed, {}, NOW, art).map((s) => s.id)).toEqual(["ok"]);
  });
  it("rejects an unknown feed version", () => {
    expect(buildSlides({ version: 2 as unknown as 1, slides: feed.slides }, {}, NOW, art)).toEqual([]);
  });
  it("allowlist matches exact hosts only", () => {
    expect(isAllowedArt("https://assets.lakesidegames.net/a.webp")).toBe(true);
    expect(isAllowedArt("not a url")).toBe(false);
  });
});

describe("motion", () => {
  const base = { reducedMotion: false, hovered: false, focused: false, hidden: false, count: 3 };
  it("advances every 7 seconds when nothing holds it", () => {
    expect(ADVANCE_MS).toBe(7000);
    expect(shouldAutoAdvance(base)).toBe(true);
  });
  it.each([["reduced motion", { reducedMotion: true }], ["hover", { hovered: true }], ["focus", { focused: true }], ["hidden window", { hidden: true }], ["a single slide", { count: 1 }]])(
    "does not advance on %s",
    (_n, o) => expect(shouldAutoAdvance({ ...base, ...o })).toBe(false),
  );
  it("wraps indexes both ways", () => {
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(4, 4)).toBe(0);
    expect(wrapIndex(1, 0)).toBe(0);
  });
});
